alter table public.swipes
  add column dwell_ms integer not null default 0
  constraint swipes_dwell_ms_valid check (dwell_ms between 0 and 30000);

drop function public.submit_swipe(uuid, integer, text, text);

create function public.submit_swipe(
  p_session_id uuid,
  p_round integer,
  p_item_id text,
  p_direction text,
  p_dwell_ms integer default 0
)
returns table (
  outcome text,
  match_id uuid,
  matched_item_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_session public.sessions%rowtype;
  v_existing_direction text;
  v_match_id uuid;
  v_match_item text;
  v_item_count integer;
  v_user_swipe_count integer;
  v_finished_participants integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_direction not in ('left', 'right') then
    raise exception using errcode = '22023', message = 'invalid_swipe_direction';
  end if;
  if p_dwell_ms < 0 or p_dwell_ms > 30000 then
    raise exception using errcode = '22023', message = 'invalid_dwell_time';
  end if;

  select p.id into v_participant_id
  from public.participants p
  where p.session_id = p_session_id and p.auth_user_id = v_user_id;

  if v_participant_id is null then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;

  select s.* into v_session
  from public.sessions s
  where s.id = p_session_id
  for update;

  if v_session.expires_at <= now() then
    update public.sessions set status = 'expired' where id = p_session_id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;

  if v_session.status = 'matched' then
    select m.id, m.item_id into v_match_id, v_match_item
    from public.matches m where m.session_id = p_session_id;
    return query select 'match'::text, v_match_id, v_match_item;
    return;
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'room_not_active';
  end if;
  if p_round <> v_session.round_number then
    raise exception using errcode = '22023', message = 'wrong_round';
  end if;
  if not exists (
    select 1 from public.session_items si
    where si.session_id = p_session_id
      and si.round = p_round
      and si.item_id = p_item_id
  ) then
    raise exception using errcode = '22023', message = 'item_not_in_deck';
  end if;

  select s.direction into v_existing_direction
  from public.swipes s
  where s.participant_id = v_participant_id
    and s.round = p_round
    and s.item_id = p_item_id;

  if v_existing_direction is not null and v_existing_direction <> p_direction then
    raise exception using errcode = '23505', message = 'swipe_already_submitted';
  end if;
  if v_existing_direction is null then
    insert into public.swipes (
      session_id,
      participant_id,
      round,
      item_id,
      direction,
      dwell_ms
    ) values (
      p_session_id,
      v_participant_id,
      p_round,
      p_item_id,
      p_direction,
      p_dwell_ms
    );
  end if;

  select count(*) into v_item_count
  from public.session_items si
  where si.session_id = p_session_id and si.round = p_round;

  select count(*) into v_user_swipe_count
  from public.swipes s
  where s.participant_id = v_participant_id and s.round = p_round;

  select count(*) into v_finished_participants
  from (
    select s.participant_id
    from public.swipes s
    where s.session_id = p_session_id and s.round = p_round
    group by s.participant_id
    having count(*) = v_item_count
  ) finished;

  if v_finished_participants = 2 then
    select candidate.item_id into v_match_item
    from (
      select
        s.item_id,
        sum(s.dwell_ms) as combined_dwell_ms,
        si.position
      from public.swipes s
      join public.session_items si
        on si.session_id = s.session_id
       and si.round = s.round
       and si.item_id = s.item_id
      where s.session_id = p_session_id
        and s.round = p_round
        and s.direction = 'right'
      group by s.item_id, si.position
      having count(distinct s.participant_id) = 2
      order by combined_dwell_ms desc, si.position asc, s.item_id asc
      limit 1
    ) candidate;

    if v_match_item is not null then
      insert into public.matches (session_id, round, item_id)
      values (p_session_id, p_round, v_match_item)
      on conflict (session_id) do nothing;

      select m.id, m.item_id into v_match_id, v_match_item
      from public.matches m where m.session_id = p_session_id;

      update public.sessions
      set status = 'matched', matched_at = coalesce(matched_at, now())
      where id = p_session_id;

      return query select 'match'::text, v_match_id, v_match_item;
      return;
    end if;

    update public.sessions set status = 'completed' where id = p_session_id;
    return query select 'no-match'::text, null::uuid, null::text;
  elsif v_user_swipe_count = v_item_count then
    return query select 'waiting'::text, null::uuid, null::text;
  else
    return query select 'next'::text, null::uuid, null::text;
  end if;
end;
$$;

revoke all on function public.submit_swipe(uuid, integer, text, text, integer)
  from public;
grant execute on function public.submit_swipe(uuid, integer, text, text, integer)
  to authenticated;

comment on column public.swipes.dwell_ms is
  'Foreground time spent considering the card, capped at 30 seconds by both client and database.';
comment on function public.submit_swipe(uuid, integer, text, text, integer) is
  'Stores an immutable timed swipe and resolves the highest-scoring mutual Yes only after both participants finish the deck.';
