begin;
select plan(9);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('24000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('24000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '24000000-0000-0000-0000-000000000001';

create temporary table asymmetric_room as
select *
from public.create_decision_session(
  'watch',
  '[
    {"id":"one","mode":"watch","title":"One","kicker":"FILM","meta":"2026","description":"First","background":"#20344A","accent":"#F0B7A4","tags":["Drama"]},
    {"id":"two","mode":"watch","title":"Two","kicker":"FILM","meta":"2026","description":"Second","background":"#39464C","accent":"#E9D9BE","tags":["Comedy"]},
    {"id":"three","mode":"watch","title":"Three","kicker":"FILM","meta":"2026","description":"Third","background":"#422B61","accent":"#EF4B65","tags":["Action"]}
  ]'::jsonb,
  'US'
);

set local request.jwt.claim.sub = '24000000-0000-0000-0000-000000000002';

select lives_ok(
  format(
    'select * from public.join_session(%L, null)',
    (select access_code from asymmetric_room)
  ),
  'the second participant joins'
);

select lives_ok(
  format(
    'select * from public.submit_swipe(%L, 1, ''one'', ''right'');
     select * from public.submit_swipe(%L, 1, ''two'', ''left'');
     select * from public.submit_swipe(%L, 1, ''three'', ''left'')',
    (select session_id from asymmetric_room),
    (select session_id from asymmetric_room),
    (select session_id from asymmetric_room)
  ),
  'the Android participant completes the deck with one Yes'
);

select is(
  (
    select accepted_item_ids
    from public.get_own_ranking_context(
      (select session_id from asymmetric_room),
      1
    )
  ),
  array['one']::text[],
  'the one-Yes participant sees only their own accepted choice'
);

select is(
  (
    select required_rank_count
    from public.get_own_ranking_context(
      (select session_id from asymmetric_room),
      1
    )
  ),
  1,
  'the one-Yes participant is required to rank exactly one choice'
);

select is(
  (
    select outcome
    from public.submit_rankings(
      (select session_id from asymmetric_room),
      1,
      array['one']
    )
  ),
  'waiting',
  'the one-Yes participant can submit that single choice'
);

set local request.jwt.claim.sub = '24000000-0000-0000-0000-000000000001';

select lives_ok(
  format(
    'select * from public.submit_swipe(%L, 1, ''one'', ''right'');
     select * from public.submit_swipe(%L, 1, ''two'', ''right'');
     select * from public.submit_swipe(%L, 1, ''three'', ''left'')',
    (select session_id from asymmetric_room),
    (select session_id from asymmetric_room),
    (select session_id from asymmetric_room)
  ),
  'the iPhone participant completes the deck with two Yes choices'
);

select is(
  (
    select accepted_item_ids
    from public.get_own_ranking_context(
      (select session_id from asymmetric_room),
      1
    )
  ),
  array['one', 'two']::text[],
  'the two-Yes participant sees only their own accepted choices'
);

select is(
  (
    select required_rank_count
    from public.get_own_ranking_context(
      (select session_id from asymmetric_room),
      1
    )
  ),
  2,
  'the two-Yes participant is required to rank exactly two choices'
);

select is(
  (
    select matched_item_id
    from public.submit_rankings(
      (select session_id from asymmetric_room),
      1,
      array['two', 'one']
    )
  ),
  'one',
  'the asymmetric rankings resolve only the mutually accepted choice'
);

select * from finish();
rollback;
