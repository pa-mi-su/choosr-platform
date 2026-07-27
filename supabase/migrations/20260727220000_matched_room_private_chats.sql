-- A matched decision room can open one ephemeral, end-to-end encrypted chat
-- shared only by its two authenticated participants. The first participant
-- creates the chat; the second joins it without a transferable invitation.

alter table public.chat_rooms
  add column decision_session_id uuid
  references public.sessions(id) on delete set null;

create unique index chat_rooms_one_live_decision_chat_idx
  on public.chat_rooms (decision_session_id)
  where decision_session_id is not null
    and status in ('inviting', 'active');

create function public.open_matched_room_chat(
  p_session_id uuid,
  p_public_key text
)
returns table (
  room_id uuid,
  status text,
  role text,
  own_public_key text,
  peer_public_key text,
  room_expires_at timestamptz,
  decision_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_decision_session public.sessions%rowtype;
  v_room public.chat_rooms%rowtype;
  v_role text;
  v_peer_public_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 827));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  select session.* into v_decision_session
  from public.sessions session
  where session.id = p_session_id
  for update;

  if v_decision_session.id is null
     or v_decision_session.status <> 'matched'
     or v_decision_session.completed_at is null
     or v_decision_session.completed_at <= now() - interval '24 hours'
     or not exists (
       select 1
       from public.participants participant
       where participant.session_id = p_session_id
         and participant.auth_user_id = v_user_id
     ) then
    raise exception using errcode = '42501', message = 'matched_room_chat_unavailable';
  end if;

  select room.* into v_room
  from public.chat_rooms room
  where room.decision_session_id = p_session_id
    and room.status in ('inviting', 'active')
    and room.expires_at > now()
  for update;

  if exists (
    select 1
    from public.chat_active_memberships membership
    where membership.user_id = v_user_id
      and (v_room.id is null or membership.room_id <> v_room.id)
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;

  if v_room.id is null then
    perform public.enforce_chat_rate_limit('create', 5, interval '10 minutes');

    insert into public.chat_rooms (decision_session_id, expires_at)
    values (p_session_id, now() + interval '24 hours')
    returning * into v_room;

    insert into public.chat_participants (room_id, user_id, role, public_key)
    values (v_room.id, v_user_id, 'creator', p_public_key);
    insert into public.chat_active_memberships (user_id, room_id)
    values (v_user_id, v_room.id);

    return query select
      v_room.id,
      'inviting'::text,
      'creator'::text,
      p_public_key,
      null::text,
      v_room.expires_at,
      p_session_id;
    return;
  end if;

  select participant.role into v_role
  from public.chat_participants participant
  where participant.room_id = v_room.id
    and participant.user_id = v_user_id;

  if v_role is not null then
    select peer.public_key into v_peer_public_key
    from public.chat_participants peer
    where peer.room_id = v_room.id
      and peer.user_id <> v_user_id
    limit 1;

    return query select
      v_room.id,
      v_room.status,
      v_role,
      p_public_key,
      v_peer_public_key,
      v_room.expires_at,
      p_session_id;
    return;
  end if;

  if v_room.status <> 'inviting'
     or (
       select count(*)
       from public.chat_participants participant
       where participant.room_id = v_room.id
     ) <> 1 then
    raise exception using errcode = 'P0001', message = 'matched_room_chat_unavailable';
  end if;

  perform public.enforce_chat_rate_limit('join', 10, interval '10 minutes');

  select creator.public_key into v_peer_public_key
  from public.chat_participants creator
  where creator.room_id = v_room.id
    and creator.role = 'creator';

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room.id, v_user_id, 'joiner', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room.id);
  update public.chat_rooms
  set status = 'active',
      activated_at = now()
  where id = v_room.id
  returning * into v_room;

  return query select
    v_room.id,
    'active'::text,
    'joiner'::text,
    p_public_key,
    v_peer_public_key,
    v_room.expires_at,
    p_session_id;
end;
$$;

revoke all on function public.open_matched_room_chat(uuid, text) from public;
grant execute on function public.open_matched_room_chat(uuid, text)
  to authenticated;

drop function public.get_active_chat();

create function public.get_active_chat()
returns table (
  room_id uuid,
  status text,
  role text,
  own_public_key text,
  peer_public_key text,
  room_expires_at timestamptz,
  decision_session_id uuid
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
    room.expires_at,
    room.decision_session_id
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

revoke all on function public.get_active_chat() from public;
grant execute on function public.get_active_chat() to authenticated;

drop function public.list_active_room_history();

create function public.list_active_room_history()
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
  matched_item_id text,
  partner_display_name text,
  partner_avatar_path text,
  selection_complete boolean,
  result_acknowledged boolean
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
    case
      when session.status in ('matched', 'completed')
        then session.completed_at + interval '24 hours'
      else session.expires_at
    end,
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
    ),
    partner_profile.display_name,
    partner_profile.avatar_path,
    exists (
      select 1
      from public.ranking_submissions submission
      where submission.session_id = session.id
        and submission.participant_id =
          public.participant_id_for_user(session.id, (select auth.uid()))
        and submission.round = session.round_number
    ),
    exists (
      select 1
      from public.room_completion_acknowledgements acknowledgement
      where acknowledgement.session_id = session.id
        and acknowledgement.participant_id =
          public.participant_id_for_user(session.id, (select auth.uid()))
        and acknowledgement.round = session.round_number
    )
  from public.sessions session
  left join lateral (
    select profile.display_name, profile.avatar_path
    from public.participants other_participant
    join public.profiles profile
      on profile.user_id = other_participant.auth_user_id
    where other_participant.session_id = session.id
      and other_participant.auth_user_id <> (select auth.uid())
    order by other_participant.joined_at
    limit 1
  ) partner_profile on true
  where (select auth.uid()) is not null
    and session.status in ('waiting', 'active', 'matched', 'completed')
    and (
      (
        session.status in ('waiting', 'active')
        and session.expires_at > now()
      )
      or (
        session.status in ('matched', 'completed')
        and session.completed_at > now() - interval '24 hours'
      )
    )
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
        from public.room_history_dismissals dismissal
        where dismissal.session_id = session.id
          and dismissal.participant_id =
            public.participant_id_for_user(session.id, (select auth.uid()))
          and dismissal.round = session.round_number
      )
    )
  order by coalesce(session.completed_at, session.created_at) desc
  limit 50;
$$;

revoke all on function public.list_active_room_history() from public;
grant execute on function public.list_active_room_history() to authenticated;

comment on column public.chat_rooms.decision_session_id is
  'Optional matched decision room that authorizes the two chat participants.';
comment on function public.open_matched_room_chat(uuid, text) is
  'Atomically creates or joins the live private chat for a matched room participant.';
