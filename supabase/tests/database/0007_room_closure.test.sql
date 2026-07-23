begin;
select plan(8);

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

insert into public.connections (
  id,
  requester_user_id,
  addressee_user_id,
  status,
  responded_at
) values (
  '70000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  'accepted',
  now()
);

insert into public.room_invitations (
  id,
  session_id,
  connection_id,
  sender_user_id,
  recipient_user_id,
  expires_at
) values (
  '70000000-0000-0000-0000-000000000020',
  (select session_id from waiting_room),
  '70000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  now() + interval '1 hour'
);

insert into public.notification_outbox (
  recipient_user_id,
  kind,
  payload,
  dedupe_key
) values (
  '70000000-0000-0000-0000-000000000002',
  'room_invitation',
  jsonb_build_object(
    'invitation_id', '70000000-0000-0000-0000-000000000020'::uuid,
    'session_id', (select session_id from waiting_room),
    'mode', 'watch'
  ),
  'room-closure-test'
);

select lives_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from waiting_room)
  ),
  'a host can still cancel a waiting room'
);

select isnt(
  (
    select deleted_at
    from public.user_notifications
    where dedupe_key = 'room-closure-test'
  ),
  null,
  'cancelling a room removes its invitation from the recipient inbox'
);

select is(
  (
    select status
    from public.room_invitations
    where id = '70000000-0000-0000-0000-000000000020'
  ),
  'cancelled',
  'cancelling a room cancels its pending invitation'
);

select is(
  (
    select count(*)
    from public.notification_outbox
    where dedupe_key = 'room-closure-test'
  ),
  0::bigint,
  'cancelling a room removes its undelivered push job'
);

select * from finish();
rollback;
