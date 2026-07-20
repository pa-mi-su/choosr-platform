begin;
select plan(5);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';

create temporary table closure_room as
select *
from public.create_decision_session(
  'watch',
  '[{"id":"arrival","mode":"watch","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]}]'::jsonb,
  'US'
);

set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000002';
create temporary table closure_join as
select *
from public.join_session((select access_code from closure_room), null);

select lives_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from closure_room)
  ),
  'either participant can close an active room'
);

select is(
  (select status from public.sessions where id = (select session_id from closure_room)),
  'cancelled',
  'room closure is persisted for Realtime subscribers'
);

select lives_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from closure_room)
  ),
  'room closure is idempotent'
);

set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000003';
select throws_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from closure_room)
  ),
  '42501',
  'not_a_session_participant',
  'non-participants cannot close a room'
);

set local request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';
create temporary table waiting_room as
select *
from public.create_decision_session(
  'watch',
  '[{"id":"arrival","mode":"watch","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]}]'::jsonb,
  'US'
);
select lives_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from waiting_room)
  ),
  'a host can still cancel a waiting room'
);

select * from finish();
rollback;
