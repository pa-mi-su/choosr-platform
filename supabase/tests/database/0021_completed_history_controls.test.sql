begin;
select plan(14);

select has_table(
  'public',
  'room_history_dismissals',
  'completed history removal is stored per participant'
);
select has_function(
  'public',
  'dismiss_completed_room',
  array['uuid'],
  'one completed result can be removed'
);
select has_function(
  'public',
  'dismiss_all_completed_rooms',
  array[]::text[],
  'all completed results can be removed'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.dismiss_completed_room(uuid)',
    'execute'
  ),
  'authenticated participants can remove one result'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.dismiss_all_completed_rooms()',
    'execute'
  ),
  'authenticated participants can clear their completed history'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

insert into public.profiles (user_id, display_name, handle, avatar_path)
values
  (
    'b0000000-0000-0000-0000-000000000001',
    'Alex',
    'alex_history',
    null
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'Jordan',
    'jordan_history',
    'b0000000-0000-0000-0000-000000000002/avatar-1000.webp'
  );

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
    'b1000000-0000-0000-0000-000000000001',
    'BCDEFGH2',
    encode(extensions.digest('history-control-one', 'sha256'), 'hex'),
    'b0000000-0000-0000-0000-000000000001',
    'watch',
    'completed',
    now() + interval '1 hour'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'BCDEFGH3',
    encode(extensions.digest('history-control-two', 'sha256'), 'hex'),
    'b0000000-0000-0000-0000-000000000001',
    'watch',
    'completed',
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
  ),
  (
    'b2000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'host'
  ),
  (
    'b2000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'partner'
  );

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'both completed results initially appear'
);
select is(
  (
    select partner_display_name
    from public.list_active_room_history()
    limit 1
  ),
  'Jordan',
  'completed history identifies the other participant'
);
select is(
  (
    select partner_avatar_path
    from public.list_active_room_history()
    limit 1
  ),
  'b0000000-0000-0000-0000-000000000002/avatar-1000.webp',
  'completed history includes the other participant photo path'
);

select public.dismiss_completed_room(
  'b1000000-0000-0000-0000-000000000001'
);
select is(
  (select count(*) from public.list_active_room_history()),
  1::bigint,
  'deleting one result removes only that history row'
);
select is(
  (
    select status
    from public.sessions
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'completed',
  'deleting history never mutates the shared room'
);

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'the other participant still sees both results'
);

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
select is(
  public.dismiss_all_completed_rooms(),
  1,
  'delete all removes the remaining visible result'
);
select is(
  (select count(*) from public.list_active_room_history()),
  0::bigint,
  'the current participant completed history is empty'
);

set local request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_active_room_history()),
  2::bigint,
  'delete all remains isolated from the other participant'
);

select * from finish();
rollback;
