begin;
select plan(13);

select has_table(
  'public',
  'room_completion_acknowledgements',
  'participant result acknowledgements are stored separately'
);
select has_function(
  'public',
  'acknowledge_room_completion',
  array['uuid'],
  'participants can acknowledge one completed result'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.acknowledge_room_completion(uuid)',
    'execute'
  ),
  'authenticated participants can acknowledge their own result'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.acknowledge_room_completion(uuid)',
    'execute'
  ),
  'anonymous callers cannot acknowledge results'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

insert into public.sessions (
  id,
  access_code,
  invite_token_hash,
  host_user_id,
  mode,
  status,
  expires_at
) values
  (
    'e1000000-0000-0000-0000-000000000001',
    'ECDEFGH2',
    encode(extensions.digest('matched-history-room', 'sha256'), 'hex'),
    'e0000000-0000-0000-0000-000000000001',
    'watch',
    'matched',
    now() + interval '1 hour'
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    'ECDEFGH3',
    encode(extensions.digest('completed-history-room', 'sha256'), 'hex'),
    'e0000000-0000-0000-0000-000000000001',
    'watch',
    'completed',
    now() + interval '1 hour'
  );

insert into public.participants (id, session_id, auth_user_id, role)
values
  (
    'e2000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'host'
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'partner'
  ),
  (
    'e2000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000001',
    'host'
  ),
  (
    'e2000000-0000-0000-0000-000000000004',
    'e1000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000002',
    'partner'
  );

insert into public.session_items (
  session_id,
  round,
  item_id,
  item_payload,
  position
) values
  (
    'e1000000-0000-0000-0000-000000000001',
    1,
    'shared-pick',
    '{"id":"shared-pick"}',
    1
  ),
  (
    'e1000000-0000-0000-0000-000000000002',
    1,
    'no-match-pick',
    '{"id":"no-match-pick"}',
    1
  );

insert into public.matches (session_id, round, item_id)
values ('e1000000-0000-0000-0000-000000000001', 1, 'shared-pick');

set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'matched and no-match results both appear in completed history'
);
select public.acknowledge_room_completion(
  'e1000000-0000-0000-0000-000000000001'
);
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'Done keeps the matched result in the current participant 24-hour history'
);

set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'the other participant independently sees both completed rooms'
);
select public.acknowledge_room_completion(
  'e1000000-0000-0000-0000-000000000001'
);
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'the other participant pressing Done also preserves 24-hour history'
);
select is(
  (
    select status
    from public.sessions
    where id = 'e1000000-0000-0000-0000-000000000001'
  ),
  'matched',
  'acknowledgement never cancels the shared result'
);

set local request.jwt.claim.sub = 'e0000000-0000-0000-0000-000000000001';
select public.acknowledge_room_completion(
  'e1000000-0000-0000-0000-000000000002'
);
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'all acknowledged terminal rooms remain available for 24 hours'
);

select ok(
  (
    select completed_at is not null
    from public.sessions
    where id = 'e1000000-0000-0000-0000-000000000001'
  ),
  'terminal transitions receive an authoritative completion timestamp'
);

update public.sessions
set completed_at = now() - interval '25 hours'
where id = 'e1000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.list_active_room_history()),
  1::bigint,
  'a completed result leaves history exactly after its 24-hour window'
);

select public.cleanup_expired_sessions();
select is(
  (
    select status
    from public.sessions
    where id = 'e1000000-0000-0000-0000-000000000001'
  ),
  'expired',
  'retention cleanup expires terminal rooms only after history closes'
);

select * from finish();
rollback;
