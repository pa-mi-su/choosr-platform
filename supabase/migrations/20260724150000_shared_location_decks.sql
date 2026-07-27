create table public.session_locations (
  session_id uuid not null
    references public.sessions(id) on delete cascade,
  participant_id uuid not null
    references public.participants(id) on delete cascade,
  latitude double precision not null
    constraint session_locations_latitude_valid check (latitude between -90 and 90),
  longitude double precision not null
    constraint session_locations_longitude_valid check (longitude between -180 and 180),
  location_label text not null
    constraint session_locations_label_present check (
      length(btrim(location_label)) between 1 and 120
    ),
  submitted_at timestamptz not null default now(),
  primary key (session_id, participant_id)
);

alter table public.session_locations enable row level security;
revoke all on public.session_locations from anon, authenticated;
grant select, insert, update on public.session_locations to service_role;

comment on table public.session_locations is
  'Ephemeral, room-scoped participant locations used only to build fair local decks. Direct client access is intentionally denied.';

create or replace function private.delete_closed_session_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'expired') and old.status is distinct from new.status then
    delete from public.session_locations location
    where location.session_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.delete_closed_session_locations() from public;

drop trigger if exists sessions_delete_closed_locations on public.sessions;
create trigger sessions_delete_closed_locations
after update of status on public.sessions
for each row execute function private.delete_closed_session_locations();

create function public.create_location_decision_session(
  p_mode text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_region text default 'US'
)
returns table (
  session_id uuid,
  access_code text,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_participant_id uuid;
  v_access_code text;
  v_access_code_bytes bytea;
  v_invite_token text;
  v_expires_at timestamptz;
  v_mode text := lower(btrim(p_mode));
  v_region text := upper(btrim(p_region));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_mode not in ('eat', 'do') then
    raise exception using errcode = '22023', message = 'invalid_location_mode';
  end if;
  if p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'invalid_location';
  end if;
  if length(btrim(p_location_label)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid_location_label';
  end if;
  if v_region !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_region';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  if (
    select count(*)
    from public.sessions s
    where s.host_user_id = v_user_id
      and s.created_at >= now() - interval '24 hours'
  ) >= 20 then
    raise exception using errcode = '54000', message = 'session_creation_rate_limited';
  end if;

  loop
    v_access_code_bytes := extensions.gen_random_bytes(8);
    select string_agg(
      substr(
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        (get_byte(v_access_code_bytes, byte_index) % 32) + 1,
        1
      ),
      '' order by byte_index
    )
    into v_access_code
    from generate_series(0, 7) as byte_index;
    v_invite_token := encode(extensions.gen_random_bytes(24), 'hex');
    begin
      insert into public.sessions (
        access_code,
        invite_token_hash,
        host_user_id,
        mode,
        region
      ) values (
        v_access_code,
        encode(extensions.digest(v_invite_token, 'sha256'), 'hex'),
        v_user_id,
        v_mode,
        v_region
      )
      returning id, public.sessions.expires_at
      into v_session_id, v_expires_at;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session_id, v_user_id, 'host')
  returning id into v_participant_id;

  insert into public.session_locations (
    session_id,
    participant_id,
    latitude,
    longitude,
    location_label
  ) values (
    v_session_id,
    v_participant_id,
    p_latitude,
    p_longitude,
    btrim(p_location_label)
  );

  return query select v_session_id, v_access_code, v_invite_token, v_expires_at;
end;
$$;

create function public.record_session_location(
  p_session_id uuid,
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text
)
returns table (
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
begin
  if p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or length(btrim(p_location_label)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid_location';
  end if;

  select p.id into v_participant_id
  from public.participants p
  join public.sessions s on s.id = p.session_id
  where p.session_id = p_session_id
    and p.auth_user_id = p_user_id
    and s.mode in ('eat', 'do')
    and s.status = 'waiting'
    and s.expires_at > now();

  if not found then
    raise exception using errcode = '42501', message = 'location_room_unavailable';
  end if;

  insert into public.session_locations (
    session_id,
    participant_id,
    latitude,
    longitude,
    location_label
  ) values (
    p_session_id,
    v_participant_id,
    p_latitude,
    p_longitude,
    btrim(p_location_label)
  )
  on conflict (session_id, participant_id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      location_label = excluded.location_label,
      submitted_at = now();

  if (
    select count(*)
    from public.session_locations sl
    where sl.session_id = p_session_id
  ) <> 2 then
    return;
  end if;

  return query
    select sl.latitude, sl.longitude
    from public.session_locations sl
    where sl.session_id = p_session_id
    order by sl.participant_id;
end;
$$;

create function public.finalize_location_session(
  p_session_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select s.* into v_session
  from public.sessions s
  where s.id = p_session_id
  for update;

  if not found
     or v_session.mode not in ('eat', 'do')
     or v_session.status not in ('waiting', 'active')
     or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'location_room_unavailable';
  end if;
  if (
    select count(*) from public.participants p where p.session_id = p_session_id
  ) <> 2 or (
    select count(*) from public.session_locations sl where sl.session_id = p_session_id
  ) <> 2 then
    raise exception using errcode = 'P0001', message = 'locations_incomplete';
  end if;

  perform public.validate_decision_deck(v_session.mode, p_items);

  if not exists (
    select 1 from public.session_items si
    where si.session_id = p_session_id and si.round = v_session.round_number
  ) then
    insert into public.session_items (
      session_id,
      round,
      item_id,
      item_payload,
      position
    )
    select
      p_session_id,
      v_session.round_number,
      item->>'id',
      item,
      ordinal::integer
    from jsonb_array_elements(p_items) with ordinality as deck(item, ordinal);
  end if;

  update public.sessions
  set status = 'active'
  where id = p_session_id;

  delete from public.session_locations
  where session_id = p_session_id;
end;
$$;

create or replace function public.join_session(
  p_access_code text default null,
  p_invite_token text default null
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
  v_session public.sessions%rowtype;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if nullif(btrim(p_access_code), '') is null
     and nullif(btrim(p_invite_token), '') is null then
    raise exception using errcode = '22023', message = 'invite_required';
  end if;

  select s.* into v_session
  from public.sessions s
  where (
      p_invite_token is not null
      and s.invite_token_hash = encode(
        extensions.digest(btrim(p_invite_token), 'sha256'),
        'hex'
      )
    ) or (
      p_invite_token is null
      and s.access_code = upper(btrim(p_access_code))
    )
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if exists (
    select 1 from public.participants p
    where p.session_id = v_session.id and p.auth_user_id = v_user_id
  ) then
    return query
      select v_session.id, v_session.status, v_session.round_number, v_session.expires_at;
    return;
  end if;
  if v_session.expires_at <= now() then
    update public.sessions set status = 'expired' where id = v_session.id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;
  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_unavailable';
  end if;
  if (select count(*) from public.participants p where p.session_id = v_session.id) >= 2 then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner');

  v_next_status := case
    when exists (
      select 1 from public.session_items si where si.session_id = v_session.id
    ) then 'active'
    else 'waiting'
  end;
  update public.sessions set status = v_next_status where id = v_session.id;

  return query
    select v_session.id, v_next_status, v_session.round_number, v_session.expires_at;
end;
$$;

create or replace function public.respond_room_invitation(
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
  v_next_status text;
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
  if (
    select count(*)
    from public.participants p
    where p.session_id = v_session.id
  ) >= 2 then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner')
  on conflict on constraint participants_session_id_auth_user_id_key do nothing;

  v_next_status := case
    when exists (
      select 1 from public.session_items si where si.session_id = v_session.id
    ) then 'active'
    else 'waiting'
  end;
  update public.sessions set status = v_next_status where id = v_session.id;
  update public.room_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  return query
    select v_session.id, v_next_status, v_session.round_number, v_session.expires_at;
end;
$$;

revoke all on function public.create_location_decision_session(
  text, double precision, double precision, text, text
) from public;
revoke all on function public.record_session_location(
  uuid, uuid, double precision, double precision, text
) from public;
revoke all on function public.finalize_location_session(uuid, jsonb) from public;

grant execute on function public.create_location_decision_session(
  text, double precision, double precision, text, text
) to authenticated;
grant execute on function public.record_session_location(
  uuid, uuid, double precision, double precision, text
) to service_role;
grant execute on function public.finalize_location_session(uuid, jsonb) to service_role;

comment on function public.record_session_location(
  uuid, uuid, double precision, double precision, text
) is 'Service-only location submission. Coordinates are never exposed through the client API.';
