-- Ranking choices are private per participant. Return the caller's accepted
-- choices and submission in one authenticated database snapshot so the mobile
-- client never derives a ranking requirement from mixed or stale reads.

create function public.get_own_ranking_context(
  p_session_id uuid,
  p_round integer
)
returns table (
  accepted_item_ids text[],
  ranked_item_ids text[],
  required_rank_count integer,
  submitted boolean,
  deck_completed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_session_round integer;
  v_item_count integer;
  v_swipe_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_session_id is null or p_round is null or p_round < 1 then
    raise exception using errcode = '22023', message = 'invalid_ranking_context';
  end if;

  select participant.id
  into v_participant_id
  from public.participants participant
  where participant.session_id = p_session_id
    and participant.auth_user_id = v_user_id;

  if v_participant_id is null then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;

  select session.round_number
  into v_session_round
  from public.sessions session
  where session.id = p_session_id;

  if v_session_round is null or p_round <> v_session_round then
    raise exception using errcode = '22023', message = 'wrong_round';
  end if;

  select count(*)
  into v_item_count
  from public.session_items item
  where item.session_id = p_session_id
    and item.round = p_round;

  select count(*)
  into v_swipe_count
  from public.swipes swipe
  where swipe.participant_id = v_participant_id
    and swipe.round = p_round;

  return query
  select
    coalesce(
      (
        select array_agg(swipe.item_id order by item.position)
        from public.swipes swipe
        join public.session_items item
          on item.session_id = swipe.session_id
         and item.round = swipe.round
         and item.item_id = swipe.item_id
        where swipe.participant_id = v_participant_id
          and swipe.round = p_round
          and swipe.direction = 'right'
      ),
      array[]::text[]
    ) as accepted_item_ids,
    coalesce(
      (
        select array_agg(ranking.item_id order by ranking.rank)
        from public.choice_rankings ranking
        where ranking.participant_id = v_participant_id
          and ranking.round = p_round
      ),
      array[]::text[]
    ) as ranked_item_ids,
    least(
      (
        select count(*)::integer
        from public.swipes swipe
        where swipe.participant_id = v_participant_id
          and swipe.round = p_round
          and swipe.direction = 'right'
      ),
      3
    ) as required_rank_count,
    exists (
      select 1
      from public.ranking_submissions submission
      where submission.participant_id = v_participant_id
        and submission.round = p_round
    ) as submitted,
    v_item_count > 0 and v_swipe_count = v_item_count as deck_completed;
end;
$$;

revoke all on function public.get_own_ranking_context(uuid, integer)
  from public;
grant execute on function public.get_own_ranking_context(uuid, integer)
  to authenticated;

comment on function public.get_own_ranking_context(uuid, integer) is
  'Returns one authenticated participant''s private Yes choices and ranking state atomically.';
