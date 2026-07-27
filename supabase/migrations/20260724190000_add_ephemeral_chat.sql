create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'inviting'
    constraint chat_rooms_status_valid
    check (status in ('inviting', 'active', 'destroyed', 'expired')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  destroyed_at timestamptz,
  destruction_reason text
    constraint chat_rooms_destruction_reason_valid
    check (destruction_reason in ('participant', 'expired')),
  constraint chat_rooms_expiration_valid
    check (expires_at > created_at)
);

create table public.chat_participants (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null constraint chat_participants_role_valid
    check (role in ('creator', 'joiner')),
  public_key text not null constraint chat_participants_public_key_valid
    check (
      length(public_key) = 44
      and public_key ~ '^[A-Za-z0-9+/]{43}=$'
    ),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, role)
);

-- This table is the one-active-chat invariant. Rows are deleted during
-- destruction; unlike participants, they are never exposed through the API.
create table public.chat_active_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, room_id)
);

create table public.chat_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  token_hash text not null unique
    constraint chat_invitations_token_hash_valid
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint chat_invitations_expiration_valid
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '120 seconds'
    )
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id uuid not null,
  nonce text not null constraint chat_messages_nonce_valid
    check (
      length(nonce) = 32
      and nonce ~ '^[A-Za-z0-9+/]{32}$'
    ),
  ciphertext text not null constraint chat_messages_ciphertext_valid
    check (
      length(ciphertext) between 24 and 16384
      and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'
    ),
  created_at timestamptz not null default now(),
  unique (room_id, sender_user_id, client_message_id),
  foreign key (room_id, sender_user_id)
    references public.chat_participants(room_id, user_id) on delete cascade
);

create table public.chat_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('create', 'join', 'message')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, action, window_started_at)
);

-- Destruction receipts are short-lived idempotency records only. They grant no
-- room access and allow a retry after participant rows have already vanished.
create table public.chat_destruction_receipts (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (room_id, user_id)
);

create index chat_rooms_expiration_idx
  on public.chat_rooms (expires_at)
  where status in ('inviting', 'active');
create index chat_invitations_expiration_idx
  on public.chat_invitations (expires_at)
  where consumed_at is null;
create index chat_messages_room_order_idx
  on public.chat_messages (room_id, id);
create index chat_rate_limits_expiration_idx
  on public.chat_rate_limits (window_started_at);
create index chat_destruction_receipts_expiration_idx
  on public.chat_destruction_receipts (expires_at);

alter table public.chat_rooms enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_active_memberships enable row level security;
alter table public.chat_invitations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_rate_limits enable row level security;
alter table public.chat_destruction_receipts enable row level security;

revoke all on public.chat_rooms from anon, authenticated;
revoke all on public.chat_participants from anon, authenticated;
revoke all on public.chat_active_memberships from anon, authenticated;
revoke all on public.chat_invitations from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_rate_limits from anon, authenticated;
revoke all on public.chat_destruction_receipts from anon, authenticated;

grant select on public.chat_rooms to authenticated;
grant select on public.chat_participants to authenticated;
grant select on public.chat_messages to authenticated;

create function public.is_active_chat_participant(
  p_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_participants participant
    join public.chat_rooms room on room.id = participant.room_id
    where participant.room_id = p_room_id
      and participant.user_id = (select auth.uid())
      and room.status in ('inviting', 'active')
      and room.expires_at > now()
  );
$$;

create policy chat_rooms_select_active_members
  on public.chat_rooms for select to authenticated
  using (public.is_active_chat_participant(id));
create policy chat_participants_select_active_members
  on public.chat_participants for select to authenticated
  using (public.is_active_chat_participant(room_id));
create policy chat_messages_select_active_members
  on public.chat_messages for select to authenticated
  using (public.is_active_chat_participant(room_id));

create function public.enforce_chat_rate_limit(
  p_action text,
  p_limit integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_window_started_at timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_action not in ('create', 'join', 'message')
     or p_limit < 1
     or p_window < interval '1 second' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  v_window_started_at :=
    to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
      * extract(epoch from p_window));

  insert into public.chat_rate_limits (
    user_id,
    action,
    window_started_at,
    request_count
  ) values (
    v_user_id,
    p_action,
    v_window_started_at,
    1
  )
  on conflict (user_id, action, window_started_at)
  do update set request_count = public.chat_rate_limits.request_count + 1
  returning request_count into v_count;

  if v_count > p_limit then
    raise exception using errcode = 'P0001', message = 'chat_rate_limit_exceeded';
  end if;
end;
$$;

create function public.create_chat_invitation(p_public_key text)
returns table (
  room_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
  v_token text;
  v_invitation_expires_at timestamptz := now() + interval '90 seconds';
  v_room_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform public.enforce_chat_rate_limit('create', 5, interval '10 minutes');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  if exists (
    select 1 from public.chat_active_memberships
    where user_id = v_user_id
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;

  insert into public.chat_rooms (expires_at)
  values (v_room_expires_at)
  returning id into v_room_id;

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room_id, v_user_id, 'creator', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room_id);

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.chat_invitations (
    room_id,
    token_hash,
    expires_at
  ) values (
    v_room_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_invitation_expires_at
  );

  return query select
    v_room_id,
    v_token,
    v_invitation_expires_at,
    v_room_expires_at;
end;
$$;

create function public.join_chat_invitation(
  p_invitation_token text,
  p_public_key text
)
returns table (
  room_id uuid,
  peer_public_key text,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.chat_invitations%rowtype;
  v_room public.chat_rooms%rowtype;
  v_peer_public_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_token is null
     or p_invitation_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_chat_invitation';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform public.enforce_chat_rate_limit('join', 10, interval '10 minutes');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  select invitation.* into v_invitation
  from public.chat_invitations invitation
  where invitation.token_hash =
    encode(extensions.digest(p_invitation_token, 'sha256'), 'hex')
  for update;

  if v_invitation.id is null
     or v_invitation.consumed_at is not null
     or v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'chat_invitation_unavailable';
  end if;

  select room.* into v_room
  from public.chat_rooms room
  where room.id = v_invitation.room_id
  for update;

  if v_room.status <> 'inviting' or v_room.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'chat_invitation_unavailable';
  end if;
  if exists (
    select 1 from public.chat_active_memberships
    where user_id = v_user_id
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;
  if exists (
    select 1 from public.chat_participants participant
    where participant.room_id = v_room.id
      and participant.user_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'creator_cannot_join_own_chat';
  end if;
  if (
    select count(*) from public.chat_participants participant
    where participant.room_id = v_room.id
  ) <> 1 then
    raise exception using errcode = 'P0001', message = 'chat_room_full';
  end if;

  select participant.public_key into v_peer_public_key
  from public.chat_participants participant
  where participant.room_id = v_room.id and participant.role = 'creator';

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room.id, v_user_id, 'joiner', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room.id);
  update public.chat_invitations
  set consumed_at = now()
  where id = v_invitation.id;
  update public.chat_rooms
  set status = 'active', activated_at = now()
  where id = v_room.id;

  return query select v_room.id, v_peer_public_key, v_room.expires_at;
end;
$$;

create function public.get_active_chat()
returns table (
  room_id uuid,
  status text,
  role text,
  own_public_key text,
  peer_public_key text,
  room_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    room.id,
    room.status,
    own.role,
    own.public_key,
    peer.public_key,
    room.expires_at
  from public.chat_active_memberships membership
  join public.chat_rooms room on room.id = membership.room_id
  join public.chat_participants own
    on own.room_id = room.id and own.user_id = (select auth.uid())
  left join public.chat_participants peer
    on peer.room_id = room.id and peer.user_id <> own.user_id
  where membership.user_id = (select auth.uid())
    and room.status in ('inviting', 'active')
    and room.expires_at > now()
  limit 1;
$$;

create function public.send_chat_ciphertext(
  p_room_id uuid,
  p_client_message_id uuid,
  p_nonce text,
  p_ciphertext text
)
returns table (
  message_id bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.chat_rooms%rowtype;
  v_message_id bigint;
  v_created_at timestamptz;
  v_recipient_user_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_client_message_id is null
     or p_nonce is null
     or length(p_nonce) <> 32
     or p_nonce !~ '^[A-Za-z0-9+/]{32}$'
     or p_ciphertext is null
     or length(p_ciphertext) not between 24 and 16384
     or p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception using errcode = '22023', message = 'invalid_chat_ciphertext';
  end if;

  perform public.enforce_chat_rate_limit('message', 60, interval '1 minute');
  select room.* into v_room
  from public.chat_rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null
     or v_room.status <> 'active'
     or v_room.expires_at <= now()
     or not exists (
       select 1 from public.chat_participants participant
       where participant.room_id = p_room_id
         and participant.user_id = v_user_id
     )
     or (
       select count(*) from public.chat_participants participant
       where participant.room_id = p_room_id
     ) <> 2 then
    raise exception using errcode = '42501', message = 'chat_not_available';
  end if;

  insert into public.chat_messages (
    room_id,
    sender_user_id,
    client_message_id,
    nonce,
    ciphertext
  ) values (
    p_room_id,
    v_user_id,
    p_client_message_id,
    p_nonce,
    p_ciphertext
  )
  on conflict (room_id, sender_user_id, client_message_id)
  do update set client_message_id = excluded.client_message_id
  returning id, chat_messages.created_at into v_message_id, v_created_at;

  select participant.user_id into v_recipient_user_id
  from public.chat_participants participant
  where participant.room_id = p_room_id
    and participant.user_id <> v_user_id;

  insert into public.notification_outbox (
    recipient_user_id,
    kind,
    payload,
    dedupe_key
  ) values (
    v_recipient_user_id,
    'chat_message',
    '{}'::jsonb,
    'chat-message:' || v_message_id::text
  ) on conflict (dedupe_key) do nothing;

  return query select v_message_id, v_created_at;
end;
$$;

create function public.destroy_chat_room_internal(
  p_room_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason not in ('participant', 'expired') then
    raise exception using errcode = '22023', message = 'invalid_destruction_reason';
  end if;

  insert into public.chat_destruction_receipts (room_id, user_id, expires_at)
  select p_room_id, participant.user_id, now() + interval '24 hours'
  from public.chat_participants participant
  where participant.room_id = p_room_id
  on conflict (room_id, user_id)
  do update set expires_at = excluded.expires_at;

  update public.chat_rooms
  set status = case when p_reason = 'expired' then 'expired' else 'destroyed' end,
      destroyed_at = coalesce(destroyed_at, now()),
      destruction_reason = coalesce(destruction_reason, p_reason)
  where id = p_room_id
    and status in ('inviting', 'active');

  delete from public.user_notifications notification
  where notification.dedupe_key in (
    select 'chat-message:' || message.id::text
    from public.chat_messages message
    where message.room_id = p_room_id
  );
  delete from public.notification_outbox notification
  where notification.dedupe_key in (
    select 'chat-message:' || message.id::text
    from public.chat_messages message
    where message.room_id = p_room_id
  );
  delete from public.chat_messages where room_id = p_room_id;
  delete from public.chat_invitations where room_id = p_room_id;
  delete from public.chat_active_memberships where room_id = p_room_id;
  delete from public.chat_participants where room_id = p_room_id;
end;
$$;

create function public.destroy_chat_room(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text, 422));
  if not exists (
    select 1 from public.chat_participants
    where room_id = p_room_id and user_id = v_user_id
  ) then
    if exists (
      select 1 from public.chat_destruction_receipts
      where room_id = p_room_id
        and user_id = v_user_id
        and expires_at > now()
    ) then
      select status into v_status from public.chat_rooms where id = p_room_id;
      return coalesce(v_status, 'destroyed');
    end if;
    raise exception using errcode = '42501', message = 'chat_not_available';
  end if;

  perform public.destroy_chat_room_internal(p_room_id, 'participant');
  return 'destroyed';
end;
$$;

create function public.cleanup_expired_chats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room record;
  v_count integer := 0;
begin
  for v_room in
    select invitation.room_id as id
    from public.chat_invitations invitation
    join public.chat_rooms room on room.id = invitation.room_id
    where invitation.consumed_at is null
      and invitation.expires_at <= now()
      and room.status = 'inviting'
    for update of room skip locked
  loop
    perform public.destroy_chat_room_internal(v_room.id, 'expired');
    v_count := v_count + 1;
  end loop;

  for v_room in
    select id from public.chat_rooms
    where status in ('inviting', 'active') and expires_at <= now()
    for update skip locked
  loop
    perform public.destroy_chat_room_internal(v_room.id, 'expired');
    v_count := v_count + 1;
  end loop;

  delete from public.chat_invitations
  where consumed_at is null and expires_at <= now();
  delete from public.chat_rate_limits
  where window_started_at < now() - interval '1 day';
  delete from public.chat_destruction_receipts
  where expires_at <= now();
  delete from public.chat_rooms
  where destroyed_at < now() - interval '7 days';
  return v_count;
end;
$$;

alter table public.notification_outbox
  drop constraint notification_outbox_kind_valid,
  add constraint notification_outbox_kind_valid
  check (kind in ('connection_request', 'room_invitation', 'chat_message'));
alter table public.user_notifications
  drop constraint user_notifications_kind_valid,
  add constraint user_notifications_kind_valid
  check (kind in ('connection_request', 'room_invitation', 'chat_message'));

create or replace function public.archive_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := new.payload->>'mode';
begin
  insert into public.user_notifications (
    recipient_user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  ) values (
    new.recipient_user_id,
    new.kind,
    case new.kind
      when 'connection_request' then 'New Choosr connection'
      when 'chat_message' then 'New private Choosr message'
      else 'You''re invited'
    end,
    case new.kind
      when 'connection_request' then 'Someone wants to add you to their Circle.'
      when 'chat_message' then 'Open Choosr to view it privately.'
      when 'room_invitation' then
        case v_mode
          when 'eat' then 'Open Choosr to pick food together.'
          when 'do' then 'Open Choosr to pick an activity together.'
          else 'Open Choosr to choose together.'
        end
    end,
    new.payload,
    new.dedupe_key
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-chats') then
    perform cron.unschedule('cleanup-expired-chats');
  end if;
  perform cron.schedule(
    'cleanup-expired-chats',
    '* * * * *',
    'select public.cleanup_expired_chats();'
  );
end;
$$;

alter publication supabase_realtime add table public.chat_rooms;
alter publication supabase_realtime add table public.chat_participants;
alter publication supabase_realtime add table public.chat_messages;

revoke all on function public.is_active_chat_participant(uuid) from public;
revoke all on function public.enforce_chat_rate_limit(text, integer, interval) from public;
revoke all on function public.create_chat_invitation(text) from public;
revoke all on function public.join_chat_invitation(text, text) from public;
revoke all on function public.get_active_chat() from public;
revoke all on function public.send_chat_ciphertext(uuid, uuid, text, text) from public;
revoke all on function public.destroy_chat_room_internal(uuid, text) from public;
revoke all on function public.destroy_chat_room(uuid) from public;
revoke all on function public.cleanup_expired_chats() from public;

grant execute on function public.create_chat_invitation(text) to authenticated;
grant execute on function public.join_chat_invitation(text, text) to authenticated;
grant execute on function public.get_active_chat() to authenticated;
grant execute on function public.send_chat_ciphertext(uuid, uuid, text, text) to authenticated;
grant execute on function public.destroy_chat_room(uuid) to authenticated;
grant execute on function public.is_active_chat_participant(uuid) to authenticated;
grant execute on function public.cleanup_expired_chats() to service_role;

comment on table public.chat_messages is
  'E2EE envelope storage. This table intentionally has no plaintext content column.';
comment on function public.destroy_chat_room(uuid) is
  'Atomically and idempotently destroys ciphertext, invitations, participants, and active access.';
