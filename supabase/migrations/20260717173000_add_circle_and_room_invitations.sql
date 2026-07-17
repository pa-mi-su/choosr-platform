create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_valid check (
      length(btrim(display_name)) between 1 and 40
    ),
  handle text not null unique
    constraint profiles_handle_valid check (handle ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  addressee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    constraint connections_status_valid check (
      status in ('pending', 'accepted', 'declined')
    ),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_distinct_people check (requester_user_id <> addressee_user_id)
);

create unique index connections_people_unique on public.connections (
  least(requester_user_id, addressee_user_id),
  greatest(requester_user_id, addressee_user_id)
);
create index connections_requester_idx on public.connections (requester_user_id, status);
create index connections_addressee_idx on public.connections (addressee_user_id, status);

create table public.circle_invites (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz
);

create index circle_invites_sender_idx on public.circle_invites (sender_user_id, created_at desc);

create table public.room_invitations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    constraint room_invitations_status_valid check (
      status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')
    ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  constraint room_invitations_distinct_people check (sender_user_id <> recipient_user_id)
);

create index room_invitations_recipient_idx
  on public.room_invitations (recipient_user_id, status, created_at desc);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null constraint device_push_tokens_platform_valid
    check (platform in ('ios', 'android')),
  token text not null unique constraint device_push_tokens_token_present
    check (length(btrim(token)) between 20 and 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, token)
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null constraint notification_outbox_kind_valid
    check (kind in ('connection_request', 'room_invitation')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempts integer not null default 0
);

alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.circle_invites enable row level security;
alter table public.room_invitations enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.connections from anon, authenticated;
revoke all on public.circle_invites from anon, authenticated;
revoke all on public.room_invitations from anon, authenticated;
revoke all on public.device_push_tokens from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;

create function public.upsert_choosr_profile(
  p_display_name text,
  p_handle text
)
returns table (user_id uuid, display_name text, handle text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_display_name text := btrim(p_display_name);
  v_handle text := lower(btrim(p_handle));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(v_display_name) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,24}$' then
    raise exception using errcode = '22023', message = 'invalid_handle';
  end if;

  insert into public.profiles (user_id, display_name, handle)
  values (v_user_id, v_display_name, v_handle)
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      handle = excluded.handle,
      updated_at = now();

  return query select v_user_id, v_display_name, v_handle;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'handle_taken';
end;
$$;

create function public.get_choosr_profile()
returns table (user_id uuid, display_name text, handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.handle
  from public.profiles p
  where p.user_id = (select auth.uid());
$$;

create function public.send_connection_request(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recipient_id uuid;
  v_connection_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'profile_required';
  end if;

  select p.user_id into v_recipient_id
  from public.profiles p
  where p.handle = lower(btrim(p_handle));

  if v_recipient_id is null then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if v_recipient_id = v_user_id then
    raise exception using errcode = '22023', message = 'cannot_connect_to_self';
  end if;

  insert into public.connections (requester_user_id, addressee_user_id)
  values (v_user_id, v_recipient_id)
  returning id into v_connection_id;

  insert into public.notification_outbox (
    recipient_user_id,
    kind,
    payload,
    dedupe_key
  ) values (
    v_recipient_id,
    'connection_request',
    jsonb_build_object('connection_id', v_connection_id, 'sender_user_id', v_user_id),
    'connection:' || v_connection_id::text
  );

  return v_connection_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'connection_already_exists';
end;
$$;

create function public.respond_connection(
  p_connection_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connections
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_connection_id
    and addressee_user_id = (select auth.uid())
    and status = 'pending';

  if not found then
    raise exception using errcode = '42501', message = 'connection_request_unavailable';
  end if;
end;
$$;

create function public.create_circle_invite()
returns table (invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'profile_required';
  end if;
  if (
    select count(*) from public.circle_invites
    where sender_user_id = v_user_id and created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception using errcode = '54000', message = 'circle_invite_rate_limited';
  end if;

  loop
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    begin
      insert into public.circle_invites (sender_user_id, token_hash)
      values (
        v_user_id,
        encode(extensions.digest(v_token, 'sha256'), 'hex')
      ) returning public.circle_invites.expires_at into v_expires_at;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return query select v_token, v_expires_at;
end;
$$;

create function public.redeem_circle_invite(p_invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invite public.circle_invites%rowtype;
  v_connection_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'profile_required';
  end if;

  select ci.* into v_invite
  from public.circle_invites ci
  where ci.token_hash = encode(
    extensions.digest(btrim(p_invite_token), 'sha256'),
    'hex'
  )
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'circle_invite_not_found';
  end if;
  if v_invite.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'circle_invite_expired';
  end if;
  if v_invite.redeemed_at is not null then
    raise exception using errcode = 'P0001', message = 'circle_invite_used';
  end if;
  if v_invite.sender_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'cannot_connect_to_self';
  end if;

  select c.id into v_connection_id
  from public.connections c
  where least(c.requester_user_id, c.addressee_user_id) = least(v_invite.sender_user_id, v_user_id)
    and greatest(c.requester_user_id, c.addressee_user_id) = greatest(v_invite.sender_user_id, v_user_id)
  for update;

  if v_connection_id is null then
    insert into public.connections (
      requester_user_id,
      addressee_user_id,
      status,
      responded_at
    ) values (
      v_invite.sender_user_id,
      v_user_id,
      'accepted',
      now()
    ) returning id into v_connection_id;
  else
    update public.connections
    set status = 'accepted', responded_at = now()
    where id = v_connection_id;
  end if;

  update public.circle_invites
  set redeemed_by_user_id = v_user_id, redeemed_at = now()
  where id = v_invite.id;

  return v_connection_id;
end;
$$;

create function public.list_circle()
returns table (
  connection_id uuid,
  person_user_id uuid,
  display_name text,
  handle text,
  status text,
  direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    other_profile.user_id,
    other_profile.display_name,
    other_profile.handle,
    c.status,
    case when c.requester_user_id = (select auth.uid()) then 'outgoing' else 'incoming' end
  from public.connections c
  join public.profiles other_profile
    on other_profile.user_id = case
      when c.requester_user_id = (select auth.uid()) then c.addressee_user_id
      else c.requester_user_id
    end
  where c.requester_user_id = (select auth.uid())
     or c.addressee_user_id = (select auth.uid())
  order by (c.status = 'accepted') desc, other_profile.display_name;
$$;

create function public.invite_connection_to_session(
  p_session_id uuid,
  p_connection_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recipient_id uuid;
  v_invitation_id uuid;
  v_session public.sessions%rowtype;
begin
  select s.* into v_session
  from public.sessions s
  where s.id = p_session_id
    and s.host_user_id = v_user_id
  for update;

  if not found or v_session.status <> 'waiting' or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'room_unavailable';
  end if;

  select case
    when c.requester_user_id = v_user_id then c.addressee_user_id
    else c.requester_user_id
  end into v_recipient_id
  from public.connections c
  where c.id = p_connection_id
    and c.status = 'accepted'
    and v_user_id in (c.requester_user_id, c.addressee_user_id);

  if v_recipient_id is null then
    raise exception using errcode = '42501', message = 'accepted_connection_required';
  end if;

  insert into public.room_invitations (
    session_id,
    connection_id,
    sender_user_id,
    recipient_user_id,
    expires_at
  ) values (
    p_session_id,
    p_connection_id,
    v_user_id,
    v_recipient_id,
    v_session.expires_at
  ) returning id into v_invitation_id;

  insert into public.notification_outbox (
    recipient_user_id,
    kind,
    payload,
    dedupe_key
  ) values (
    v_recipient_id,
    'room_invitation',
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'session_id', p_session_id,
      'sender_user_id', v_user_id,
      'mode', v_session.mode
    ),
    'room-invitation:' || v_invitation_id::text
  );

  return v_invitation_id;
end;
$$;

create function public.list_pending_room_invitations()
returns table (
  invitation_id uuid,
  session_id uuid,
  sender_display_name text,
  sender_handle text,
  mode text,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  update public.room_invitations
  set status = 'expired'
  where recipient_user_id = (select auth.uid())
    and status = 'pending'
    and expires_at <= now();

  select
    ri.id,
    ri.session_id,
    p.display_name,
    p.handle,
    s.mode,
    ri.expires_at
  from public.room_invitations ri
  join public.profiles p on p.user_id = ri.sender_user_id
  join public.sessions s on s.id = ri.session_id
  where ri.recipient_user_id = (select auth.uid())
    and ri.status = 'pending'
    and ri.expires_at > now()
  order by ri.created_at desc;
$$;

create function public.respond_room_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns table (
  session_id uuid,
  status text,
  round_number integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.room_invitations%rowtype;
  v_session public.sessions%rowtype;
begin
  select ri.* into v_invitation
  from public.room_invitations ri
  where ri.id = p_invitation_id
    and ri.recipient_user_id = v_user_id
  for update;

  if not found or v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  if not p_accept then
    update public.room_invitations
    set status = 'declined', responded_at = now()
    where id = p_invitation_id;
    return;
  end if;

  select s.* into v_session
  from public.sessions s
  where s.id = v_invitation.session_id
  for update;

  if v_invitation.expires_at <= now() or v_session.expires_at <= now() then
    update public.room_invitations set status = 'expired' where id = p_invitation_id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;
  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_unavailable';
  end if;
  if (select count(*) from public.participants where session_id = v_session.id) >= 2 then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner')
  on conflict (session_id, auth_user_id) do nothing;

  update public.sessions set status = 'active' where id = v_session.id;
  update public.room_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  return query
    select v_session.id, 'active'::text, v_session.round_number, v_session.expires_at;
end;
$$;

create function public.register_push_token(p_platform text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_platform not in ('ios', 'android') or length(btrim(p_token)) not between 20 and 4096 then
    raise exception using errcode = '22023', message = 'invalid_push_token';
  end if;

  insert into public.device_push_tokens (user_id, platform, token)
  values (v_user_id, p_platform, btrim(p_token))
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = now();
end;
$$;

revoke all on function public.upsert_choosr_profile(text, text) from public;
revoke all on function public.get_choosr_profile() from public;
revoke all on function public.send_connection_request(text) from public;
revoke all on function public.respond_connection(uuid, boolean) from public;
revoke all on function public.create_circle_invite() from public;
revoke all on function public.redeem_circle_invite(text) from public;
revoke all on function public.list_circle() from public;
revoke all on function public.invite_connection_to_session(uuid, uuid) from public;
revoke all on function public.list_pending_room_invitations() from public;
revoke all on function public.respond_room_invitation(uuid, boolean) from public;
revoke all on function public.register_push_token(text, text) from public;

grant execute on function public.upsert_choosr_profile(text, text) to authenticated;
grant execute on function public.get_choosr_profile() to authenticated;
grant execute on function public.send_connection_request(text) to authenticated;
grant execute on function public.respond_connection(uuid, boolean) to authenticated;
grant execute on function public.create_circle_invite() to authenticated;
grant execute on function public.redeem_circle_invite(text) to authenticated;
grant execute on function public.list_circle() to authenticated;
grant execute on function public.invite_connection_to_session(uuid, uuid) to authenticated;
grant execute on function public.list_pending_room_invitations() to authenticated;
grant execute on function public.respond_room_invitation(uuid, boolean) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;

comment on table public.notification_outbox is
  'Transactional push-delivery boundary. A service-role worker sends APNs/FCM notifications and marks rows delivered.';
comment on table public.device_push_tokens is
  'Native device endpoints. Tokens are registered only after notification permission is granted.';

-- A Circle profile is an explicit request for a persistent identity. Preserve
-- those anonymous Auth users even when they have not opened a room recently.
create or replace function public.cleanup_stale_anonymous_users(
  p_retention interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_retention < interval '7 days' then
    raise exception using
      errcode = '22023',
      message = 'anonymous_retention_must_be_at_least_7_days';
  end if;

  delete from auth.users as auth_user
  where auth_user.is_anonymous is true
    and not exists (
      select 1 from public.profiles profile
      where profile.user_id = auth_user.id
    )
    and coalesce(
      (
        select activity.last_active_at
        from private.anonymous_user_activity as activity
        where activity.auth_user_id = auth_user.id
      ),
      auth_user.created_at
    ) < now() - p_retention
    and not exists (
      select 1
      from public.participants as participant
      join public.sessions as session on session.id = participant.session_id
      where participant.auth_user_id = auth_user.id
        and session.status in ('waiting', 'active')
        and session.expires_at > now()
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function public.cleanup_circle_artifacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_rows integer;
begin
  delete from public.circle_invites
  where expires_at < now() - interval '7 days'
     or redeemed_at < now() - interval '7 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from public.notification_outbox
  where delivered_at < now() - interval '7 days'
     or created_at < now() - interval '30 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_circle_artifacts()
from public, anon, authenticated;

select cron.schedule(
  'choosr-circle-artifact-cleanup',
  '11 5 * * *',
  $job$ select public.cleanup_circle_artifacts(); $job$
);
