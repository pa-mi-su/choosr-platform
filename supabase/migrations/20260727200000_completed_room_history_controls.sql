-- Completed-room history is shared for 24 hours, but each participant controls
-- whether an individual result remains in their own list. Removing history
-- must never cancel the room or hide it from the other participant.

create table public.room_history_dismissals (
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null,
  round integer not null constraint room_history_dismissals_round_positive
    check (round > 0),
  dismissed_at timestamptz not null default now(),
  primary key (session_id, participant_id, round),
  foreign key (participant_id, session_id)
    references public.participants(id, session_id) on delete cascade
);

alter table public.room_history_dismissals enable row level security;
revoke all on public.room_history_dismissals from anon, authenticated;

create function public.dismiss_completed_room(p_session_id uuid)
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
    and session.status in ('matched', 'completed')
    and session.completed_at > now() - interval '24 hours';

  if not found then
    raise exception using errcode = '42501', message = 'result_not_available';
  end if;

  insert into public.room_history_dismissals (
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

create function public.dismiss_all_completed_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_dismissed integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  with inserted as (
    insert into public.room_history_dismissals (
      session_id,
      participant_id,
      round
    )
    select
      session.id,
      participant.id,
      session.round_number
    from public.sessions session
    join public.participants participant
      on participant.session_id = session.id
     and participant.auth_user_id = v_user_id
    where session.status in ('matched', 'completed')
      and session.completed_at > now() - interval '24 hours'
    on conflict (session_id, participant_id, round) do nothing
    returning 1
  )
  select count(*)::integer into v_dismissed from inserted;

  return v_dismissed;
end;
$$;

revoke all on function public.dismiss_completed_room(uuid) from public;
revoke all on function public.dismiss_all_completed_rooms() from public;
grant execute on function public.dismiss_completed_room(uuid) to authenticated;
grant execute on function public.dismiss_all_completed_rooms()
  to authenticated;

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
  partner_avatar_path text
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
    partner_profile.avatar_path
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

comment on table public.room_history_dismissals is
  'Per-participant removal of completed room results; never mutates the shared room.';
comment on function public.dismiss_completed_room(uuid) is
  'Removes one completed result from only the current participant history.';
comment on function public.dismiss_all_completed_rooms() is
  'Removes all visible completed results from only the current participant history.';
