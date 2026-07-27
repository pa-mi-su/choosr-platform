begin;
select plan(9);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('d0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
select public.register_push_token('ios', 'ios-token-aaaaaaaaaaaaaaaa');
select public.register_push_token('ios', 'ios-token-bbbbbbbbbbbbbbbb');

select is(
  (
    select count(*)
    from public.device_push_tokens
    where user_id = 'd0000000-0000-0000-0000-000000000001'
      and platform = 'ios'
  ),
  2::bigint,
  'registering a second iPhone preserves both delivery endpoints'
);
select ok(
  exists (
    select 1
    from public.device_push_tokens
    where user_id = 'd0000000-0000-0000-0000-000000000001'
      and platform = 'ios'
      and token = 'ios-token-aaaaaaaaaaaaaaaa'
  )
  and exists (
    select 1
    from public.device_push_tokens
    where user_id = 'd0000000-0000-0000-0000-000000000001'
      and platform = 'ios'
      and token = 'ios-token-bbbbbbbbbbbbbbbb'
  ),
  'both iPhones remain eligible for the same notification'
);

select * from public.upsert_choosr_profile('Location Host', 'location_host');
set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
select * from public.upsert_choosr_profile('Location Guest', 'location_guest');

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
create temporary table location_connection as
select public.send_connection_request('location_guest') as id;

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
select public.respond_connection((select id from location_connection), true);

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';
create temporary table location_exit_room as
select * from public.create_location_decision_session(
  'do',
  28.5383,
  -81.3792,
  'Orlando, FL',
  'US'
);
select public.invite_connection_to_session(
  (select session_id from location_exit_room),
  (select id from location_connection)
);

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';
select * from public.respond_room_invitation(
  (
    select id
    from public.room_invitations
    where session_id = (select session_id from location_exit_room)
  ),
  true
);

select is(
  (
    select status
    from public.sessions
    where id = (select session_id from location_exit_room)
  ),
  'waiting',
  'accepted location room waits for creator-location deck preparation'
);
select is(
  (
    select count(*)
    from public.participants
    where session_id = (select session_id from location_exit_room)
  ),
  2::bigint,
  'accepted location room has both participants'
);
select is(
  (
    select count(*)
    from public.session_locations
    where session_id = (select session_id from location_exit_room)
  ),
  1::bigint,
  'only the creator location is stored for the room'
);

select lives_ok(
  format(
    'select public.cancel_session(%L)',
    (select session_id from location_exit_room)
  ),
  'the invitee can atomically leave and close the waiting location room'
);
select is(
  (
    select status
    from public.sessions
    where id = (select session_id from location_exit_room)
  ),
  'cancelled',
  'leaving marks the shared room cancelled for both people'
);
select is(
  (
    select count(*)
    from public.session_locations
    where session_id = (select session_id from location_exit_room)
  ),
  0::bigint,
  'cancelling purges the host location immediately'
);
select is(
  (select count(*) from public.list_active_room_history()),
  0::bigint,
  'the cancelled room no longer appears active to the invitee'
);

select * from finish();
rollback;
