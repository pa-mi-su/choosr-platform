begin;
select plan(8);

select has_function(
  'public',
  'list_active_room_history',
  array[]::text[],
  'active room history is exposed through one bounded RPC'
);
select ok(
  not has_function_privilege('anon', 'public.list_active_room_history()', 'execute'),
  'anonymous callers cannot execute room history'
);
select ok(
  has_function_privilege('authenticated', 'public.list_active_room_history()', 'execute'),
  'authenticated callers can execute room history'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

insert into public.sessions (
  id, access_code, invite_token_hash, host_user_id, mode, status, expires_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'BCDEFGH2',
  encode(extensions.digest('resilience-room', 'sha256'), 'hex'),
  'b0000000-0000-0000-0000-000000000001',
  'watch',
  'active',
  now() + interval '1 hour'
);

insert into public.participants (id, session_id, auth_user_id, role)
values
  (
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'host'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'partner'
  );

insert into public.session_items (session_id, round, item_id, item_payload, position)
values
  ('b1000000-0000-0000-0000-000000000001', 1, 'one', '{"id":"one"}', 1),
  ('b1000000-0000-0000-0000-000000000001', 1, 'two', '{"id":"two"}', 2);

insert into public.swipes (session_id, participant_id, round, item_id, direction)
values
  (
    'b1000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    1,
    'one',
    'right'
  ),
  (
    'b1000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002',
    1,
    'one',
    'right'
  );

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.list_active_room_history()),
  1::bigint,
  'a participant sees their active room'
);
select is(
  (select participant_count from public.list_active_room_history()),
  2::bigint,
  'the consolidated result includes participant count'
);
select is(
  (select total_choices from public.list_active_room_history()),
  2::bigint,
  'the consolidated result includes current-round choice count'
);
select is(
  (select completed_choices from public.list_active_room_history()),
  1::bigint,
  'completed choice count remains private to the current participant'
);

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000003';
select is(
  (select count(*) from public.list_active_room_history()),
  0::bigint,
  'a third party cannot discover another room'
);

select * from finish();
rollback;
