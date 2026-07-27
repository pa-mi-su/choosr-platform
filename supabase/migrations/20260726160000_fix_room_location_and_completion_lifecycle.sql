-- Local discovery belongs to the person creating the room. The invited
-- participant joins the already-selected search area and never submits a
-- second ZIP or location.

create function public.get_location_deck_context(
  p_session_id uuid,
  p_user_id uuid
)
returns table (
  preparation_status text,
  mode text,
  latitude double precision,
  longitude double precision,
  location_label text
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
        null::text;
    return;
  end if;

  return query
    select
      'needs-build'::text,
      v_session.mode,
      location.latitude,
      location.longitude,
      location.location_label
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

revoke all on function public.get_location_deck_context(uuid, uuid) from public;
grant execute on function public.get_location_deck_context(uuid, uuid) to service_role;

comment on function public.get_location_deck_context(uuid, uuid) is
  'Returns only the room creator location to the deck worker after verifying the requesting participant.';

create or replace function public.record_session_location(
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
begin
  if not exists (
    select 1
    from public.participants participant
    join public.sessions session on session.id = participant.session_id
    where participant.session_id = p_session_id
      and participant.auth_user_id = p_user_id
      and participant.role = 'host'
      and session.mode in ('eat', 'do')
      and session.status = 'waiting'
      and session.expires_at > now()
  ) then
    raise exception using errcode = '42501', message = 'location_submission_not_allowed';
  end if;

  return query
    select location.latitude, location.longitude
    from public.session_locations location
    join public.participants participant
      on participant.id = location.participant_id
     and participant.session_id = location.session_id
     and participant.role = 'host'
    where location.session_id = p_session_id;
end;
$$;

revoke all on function public.record_session_location(
  uuid, uuid, double precision, double precision, text
) from public;
grant execute on function public.record_session_location(
  uuid, uuid, double precision, double precision, text
) to service_role;

create or replace function public.finalize_location_session(
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
  select session.* into v_session
  from public.sessions session
  where session.id = p_session_id
  for update;

  if not found
     or v_session.mode not in ('eat', 'do')
     or v_session.status not in ('waiting', 'active')
     or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'location_room_unavailable';
  end if;
  if exists (
    select 1
    from public.session_items item
    where item.session_id = p_session_id
      and item.round = v_session.round_number
  ) then
    update public.sessions
    set status = 'active'
    where id = p_session_id;
    return;
  end if;
  if (
    select count(*)
    from public.participants participant
    where participant.session_id = p_session_id
  ) <> 2 or not exists (
    select 1
    from public.session_locations location
    join public.participants host
      on host.id = location.participant_id
     and host.session_id = location.session_id
     and host.role = 'host'
    where location.session_id = p_session_id
  ) then
    raise exception using errcode = 'P0001', message = 'room_participants_incomplete';
  end if;

  perform public.validate_decision_deck(v_session.mode, p_items);

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

  update public.sessions
  set status = 'active'
  where id = p_session_id;

  delete from public.session_locations
  where session_id = p_session_id;
end;
$$;

revoke all on function public.finalize_location_session(uuid, jsonb) from public;
grant execute on function public.finalize_location_session(uuid, jsonb) to service_role;

comment on table public.session_locations is
  'Ephemeral room-creator location used only to build the shared local deck. Direct client access is denied.';

-- A completed result is dismissed independently by each participant and by
-- round. One participant acknowledging Done must never close or hide the room
-- for the other participant.

create table public.room_completion_acknowledgements (
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null,
  round integer not null constraint room_completion_ack_round_positive
    check (round > 0),
  acknowledged_at timestamptz not null default now(),
  primary key (session_id, participant_id, round),
  foreign key (participant_id, session_id)
    references public.participants(id, session_id) on delete cascade
);

alter table public.room_completion_acknowledgements enable row level security;
revoke all on public.room_completion_acknowledgements from anon, authenticated;

create function public.acknowledge_room_completion(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_round integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select participant.id, session.round_number
  into v_participant_id, v_round
  from public.sessions session
  join public.participants participant
    on participant.session_id = session.id
   and participant.auth_user_id = v_user_id
  where session.id = p_session_id
    and session.status in ('matched', 'completed');

  if not found then
    raise exception using errcode = '42501', message = 'result_not_available';
  end if;

  insert into public.room_completion_acknowledgements (
    session_id,
    participant_id,
    round
  ) values (
    p_session_id,
    v_participant_id,
    v_round
  ) on conflict (session_id, participant_id, round) do nothing;
end;
$$;

revoke all on function public.acknowledge_room_completion(uuid) from public;
grant execute on function public.acknowledge_room_completion(uuid) to authenticated;

create or replace function public.list_active_room_history()
returns table (
  session_id uuid,
  access_code text,
  mode text,
  status text,
  round_number integer,
  expires_at timestamptz,
  created_at timestamptz,
  participant_count bigint,
  total_choices bigint,
  completed_choices bigint,
  matched_item_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    session.id,
    session.access_code,
    session.mode,
    session.status,
    session.round_number,
    session.expires_at,
    session.created_at,
    (
      select count(*)
      from public.participants participant
      where participant.session_id = session.id
    ),
    (
      select count(*)
      from public.session_items item
      where item.session_id = session.id
        and item.round = session.round_number
    ),
    (
      select count(*)
      from public.swipes swipe
      where swipe.session_id = session.id
        and swipe.round = session.round_number
        and swipe.participant_id =
          public.participant_id_for_user(session.id, (select auth.uid()))
    ),
    (
      select match.item_id
      from public.matches match
      where match.session_id = session.id
        and match.round = session.round_number
      limit 1
    )
  from public.sessions session
  where (select auth.uid()) is not null
    and session.status in ('waiting', 'active', 'matched', 'completed')
    and session.expires_at > now()
    and exists (
      select 1
      from public.participants own_participant
      where own_participant.session_id = session.id
        and own_participant.auth_user_id = (select auth.uid())
    )
    and (
      session.status in ('waiting', 'active')
      or not exists (
        select 1
        from public.room_completion_acknowledgements acknowledgement
        where acknowledgement.session_id = session.id
          and acknowledgement.participant_id =
            public.participant_id_for_user(session.id, (select auth.uid()))
          and acknowledgement.round = session.round_number
      )
    )
  order by session.created_at desc
  limit 50;
$$;

revoke all on function public.list_active_room_history() from public;
grant execute on function public.list_active_room_history() to authenticated;

create or replace function public.cleanup_expired_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  update public.sessions
  set status = 'expired'
  where expires_at <= now()
    and status in ('waiting', 'active', 'matched', 'completed');

  delete from public.sessions
  where expires_at <= now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_sessions() from public;
