begin;
select plan(17);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

create temporary table test_room as
select *
from public.create_decision_session(
  'watch',
  '[
    {"id":"past-lives","mode":"watch","title":"Past Lives","kicker":"FILM","meta":"2023","description":"Drama","background":"#20344A","accent":"#F0B7A4","tags":["Drama"]},
    {"id":"arrival","mode":"watch","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]},
    {"id":"spiderverse","mode":"watch","title":"Into the Spider-Verse","kicker":"FILM","meta":"2018","description":"Animation","background":"#422B61","accent":"#EF4B65","tags":["Animation"]}
  ]'::jsonb,
  'US'
);

select is(
  (select count(*) from public.sessions),
  1::bigint,
  'host creates one session'
);
select is(
  (select status from public.sessions limit 1),
  'waiting',
  'new session waits for a partner'
);
select is(
  (select count(*) from public.participants),
  1::bigint,
  'host participant is created'
);
select is(
  (select count(*) from public.session_items),
  3::bigint,
  'the ordered deck is frozen for the room'
);
select matches(
  (select access_code from test_room),
  '^[A-HJ-NP-Z2-9]{8}$',
  'room has an unambiguous 40-bit fallback code'
);
select is(
  length((select invite_token from test_room)),
  48,
  'room returns a high-entropy invite token'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';

create temporary table test_join as
select *
from public.join_session((select access_code from test_room), null);

select is(
  (select status from test_join),
  'active',
  'partner activates the room'
);
select is(
  (select count(*) from public.participants),
  2::bigint,
  'room contains exactly two participants'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';

select throws_ok(
  format(
    'select * from public.join_session(%L, null)',
    (select access_code from test_room)
  ),
  'P0001',
  'room_unavailable',
  'a third participant is rejected'
);
select is(
  (select count(*) from public.participants),
  2::bigint,
  'third-user attempt does not add a participant'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';

select is(
  (
    select outcome
    from public.submit_swipe(
      (select session_id from test_room),
      1,
      'past-lives',
      'right'
    )
  ),
  'next',
  'one right swipe does not create a match'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select is(
  (
    select outcome
    from public.submit_swipe(
      (select session_id from test_room),
      1,
      'past-lives',
      'right'
    )
  ),
  'match',
  'mutual right swipes create a match'
);
select is(
  (select count(*) from public.matches),
  1::bigint,
  'exactly one match record exists'
);
select is(
  (select status from public.sessions limit 1),
  'matched',
  'session becomes matched atomically'
);

set local role authenticated;

select is(
  (select count(*) from public.swipes),
  1::bigint,
  'host can select only their own swipe'
);
select is(
  (select count(*) from public.session_items),
  3::bigint,
  'session member can read the shared deck'
);
select throws_ok(
  $$ insert into public.swipes (
       session_id, participant_id, round, item_id, direction
     ) values (
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000',
       1,
       'forbidden',
       'right'
     ) $$,
  '42501',
  'permission denied for table swipes',
  'authenticated clients cannot write directly to swipes'
);

select * from finish();
rollback;
