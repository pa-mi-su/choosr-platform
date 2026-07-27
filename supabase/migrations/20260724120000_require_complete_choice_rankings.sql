create or replace function public.submit_rankings(
  p_session_id uuid,
  p_round integer,
  p_item_ids text[]
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
  v_match_id uuid;
  v_match_item text;
  v_item_count integer;
  v_user_swipe_count integer;
  v_accepted_item_count integer;
  v_required_rank_count integer;
  v_submission_count integer;
  v_existing_items text[];
  v_requested_items text[] := coalesce(p_item_ids, array[]::text[]);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if cardinality(v_requested_items) > 3 then
    raise exception using errcode = '22023', message = 'too_many_ranked_items';
  end if;
  if exists (select 1 from unnest(v_requested_items) item where item is null) or
     cardinality(v_requested_items) <>
       (select count(distinct item) from unnest(v_requested_items) item) then
    raise exception using errcode = '22023', message = 'invalid_ranked_items';
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
  if v_session.status = 'completed' then
    return query select 'no-match'::text, null::uuid, null::text;
    return;
  end if;
  if v_session.status <> 'active' or p_round <> v_session.round_number then
    raise exception using errcode = 'P0001', message = 'room_not_active';
  end if;

  select count(*) into v_item_count
  from public.session_items si
  where si.session_id = p_session_id and si.round = p_round;

  select
    count(*),
    count(*) filter (where s.direction = 'right')
  into v_user_swipe_count, v_accepted_item_count
  from public.swipes s
  where s.participant_id = v_participant_id and s.round = p_round;

  if v_user_swipe_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'deck_not_completed';
  end if;

  v_required_rank_count := least(v_accepted_item_count, 3);
  if cardinality(v_requested_items) <> v_required_rank_count then
    raise exception using
      errcode = '22023',
      message = 'invalid_ranked_item_count';
  end if;

  if exists (
    select 1
    from unnest(v_requested_items) requested(item_id)
    where not exists (
      select 1
      from public.swipes s
      where s.participant_id = v_participant_id
        and s.round = p_round
        and s.item_id = requested.item_id
        and s.direction = 'right'
    )
  ) then
    raise exception using errcode = '22023', message = 'ranked_item_not_accepted';
  end if;

  if exists (
    select 1 from public.ranking_submissions rs
    where rs.participant_id = v_participant_id and rs.round = p_round
  ) then
    select coalesce(array_agg(cr.item_id order by cr.rank), array[]::text[])
    into v_existing_items
    from public.choice_rankings cr
    where cr.participant_id = v_participant_id and cr.round = p_round;
    if v_existing_items <> v_requested_items then
      raise exception using errcode = '23505', message = 'rankings_already_submitted';
    end if;
  else
    insert into public.ranking_submissions (session_id, participant_id, round)
    values (p_session_id, v_participant_id, p_round);

    insert into public.choice_rankings (
      session_id,
      participant_id,
      round,
      item_id,
      rank
    )
    select
      p_session_id,
      v_participant_id,
      p_round,
      ranked.item_id,
      ranked.ordinality::integer
    from unnest(v_requested_items) with ordinality as ranked(item_id, ordinality);
  end if;

  select count(*) into v_submission_count
  from public.ranking_submissions rs
  where rs.session_id = p_session_id and rs.round = p_round;

  if v_submission_count < 2 then
    return query select 'waiting'::text, null::uuid, null::text;
    return;
  end if;

  select candidate.item_id into v_match_item
  from (
    select
      cr.item_id,
      sum(4 - cr.rank) as combined_score,
      max(cr.rank) as worst_rank,
      si.position
    from public.choice_rankings cr
    join public.session_items si
      on si.session_id = cr.session_id
     and si.round = cr.round
     and si.item_id = cr.item_id
    where cr.session_id = p_session_id and cr.round = p_round
    group by cr.item_id, si.position
    having count(distinct cr.participant_id) = 2
    order by combined_score desc, worst_rank asc, si.position asc, cr.item_id asc
    limit 1
  ) candidate;

  if v_match_item is null then
    update public.sessions set status = 'completed' where id = p_session_id;
    return query select 'no-match'::text, null::uuid, null::text;
    return;
  end if;

  insert into public.matches (session_id, round, item_id)
  values (p_session_id, p_round, v_match_item)
  on conflict (session_id) do nothing;

  select m.id, m.item_id into v_match_id, v_match_item
  from public.matches m where m.session_id = p_session_id;

  update public.sessions
  set status = 'matched', matched_at = coalesce(matched_at, now())
  where id = p_session_id;

  return query select 'match'::text, v_match_id, v_match_item;
end;
$$;

revoke all on function public.submit_rankings(uuid, integer, text[]) from public;
grant execute on function public.submit_rankings(uuid, integer, text[])
  to authenticated;

comment on function public.submit_rankings(uuid, integer, text[]) is
  'Requires every accepted choice when there are three or fewer, otherwise a private top three, then resolves the strongest shared rank after both participants submit.';
