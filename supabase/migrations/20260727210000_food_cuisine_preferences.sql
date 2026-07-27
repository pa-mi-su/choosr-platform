-- Food rooms persist the creator's cuisine preference so every participant
-- prepares the same server-filtered deck. The preference is deliberately a
-- closed taxonomy that maps to supported Google Places types.

alter table public.sessions
  add column cuisine_filter text not null default 'all'
  constraint sessions_cuisine_filter_valid check (
    cuisine_filter in (
      'all',
      'american',
      'mexican',
      'italian',
      'chinese',
      'japanese',
      'indian',
      'thai',
      'mediterranean',
      'seafood',
      'pizza',
      'burgers',
      'breakfast',
      'sushi',
      'barbecue',
      'vegetarian'
    )
  );

drop function public.create_location_decision_session(
  text,
  double precision,
  double precision,
  text,
  text
);

create function public.create_location_decision_session(
  p_mode text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_region text default 'US',
  p_cuisine_filter text default 'all'
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
  v_cuisine_filter text := lower(btrim(coalesce(p_cuisine_filter, 'all')));
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
  if v_cuisine_filter not in (
    'all',
    'american',
    'mexican',
    'italian',
    'chinese',
    'japanese',
    'indian',
    'thai',
    'mediterranean',
    'seafood',
    'pizza',
    'burgers',
    'breakfast',
    'sushi',
    'barbecue',
    'vegetarian'
  ) then
    raise exception using errcode = '22023', message = 'invalid_cuisine_filter';
  end if;
  if v_mode <> 'eat' then
    v_cuisine_filter := 'all';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  if (
    select count(*)
    from public.sessions session
    where session.host_user_id = v_user_id
      and session.created_at >= now() - interval '24 hours'
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
        region,
        cuisine_filter
      ) values (
        v_access_code,
        encode(extensions.digest(v_invite_token, 'sha256'), 'hex'),
        v_user_id,
        v_mode,
        v_region,
        v_cuisine_filter
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

revoke all on function public.create_location_decision_session(
  text,
  double precision,
  double precision,
  text,
  text,
  text
) from public;
grant execute on function public.create_location_decision_session(
  text,
  double precision,
  double precision,
  text,
  text,
  text
) to authenticated;

drop function public.get_location_deck_context(uuid, uuid);

create function public.get_location_deck_context(
  p_session_id uuid,
  p_user_id uuid
)
returns table (
  preparation_status text,
  mode text,
  latitude double precision,
  longitude double precision,
  location_label text,
  cuisine_filter text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select room.* into v_session
  from public.sessions room
  where room.id = p_session_id;

  if not found
     or v_session.mode not in ('eat', 'do')
     or v_session.status not in ('waiting', 'active')
     or v_session.expires_at <= now()
     or not exists (
       select 1
       from public.participants participant
       where participant.session_id = p_session_id
         and participant.auth_user_id = p_user_id
     ) then
    raise exception using errcode = '42501', message = 'location_room_unavailable';
  end if;

  if exists (
    select 1
    from public.session_items item
    where item.session_id = p_session_id
      and item.round = v_session.round_number
  ) then
    return query
      select
        'ready'::text,
        v_session.mode,
        null::double precision,
        null::double precision,
        null::text,
        v_session.cuisine_filter;
    return;
  end if;

  return query
    select
      'needs-build'::text,
      v_session.mode,
      location.latitude,
      location.longitude,
      location.location_label,
      v_session.cuisine_filter
    from public.session_locations location
    join public.participants host
      on host.id = location.participant_id
     and host.session_id = location.session_id
     and host.role = 'host'
    where location.session_id = p_session_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'host_location_unavailable';
  end if;
end;
$$;

revoke all on function public.get_location_deck_context(uuid, uuid)
  from public;
grant execute on function public.get_location_deck_context(uuid, uuid)
  to service_role;

comment on column public.sessions.cuisine_filter is
  'Creator-selected food category used by the server-side Places query; non-food rooms use all.';
comment on function public.get_location_deck_context(uuid, uuid) is
  'Returns creator location and cuisine to the deck worker after verifying the requesting participant.';
