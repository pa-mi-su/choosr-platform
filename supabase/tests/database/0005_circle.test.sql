begin;
select plan(23);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'connections', 'connections table exists');
select has_table('public', 'circle_invites', 'contact-safe Circle invites exist');
select has_table('public', 'room_invitations', 'room invitations table exists');
select has_table('public', 'device_push_tokens', 'push endpoints table exists');
select has_table('public', 'notification_outbox', 'transactional notification outbox exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.connections'::regclass), 'connections use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.room_invitations'::regclass), 'room invitations use RLS');

select has_function('public', 'upsert_choosr_profile', array['text', 'text']);
select has_function('public', 'create_circle_invite', array[]::text[]);
select has_function('public', 'redeem_circle_invite', array['text']);
select has_function('public', 'invite_connection_to_session', array['uuid', 'uuid']);
select has_function('public', 'respond_room_invitation', array['uuid', 'boolean']);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
select * from public.upsert_choosr_profile('Alex', 'alex_one');

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select * from public.upsert_choosr_profile('Blake', 'blake_two');

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select * from public.upsert_choosr_profile('Casey', 'casey_three');

select is((select count(*) from public.profiles), 3::bigint, 'three Circle identities are created');

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
create temporary table first_connection as
select public.send_connection_request('blake_two') as id;

select is(
  (select status from public.connections where id = (select id from first_connection)),
  'pending',
  'handle connection starts pending'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select public.respond_connection((select id from first_connection), true);
select is(
  (select status from public.connections where id = (select id from first_connection)),
  'accepted',
  'recipient accepts a handle connection'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
create temporary table contact_invite as select * from public.create_circle_invite();
select is(length((select invite_token from contact_invite)), 48, 'contact invite returns 192-bit token');

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000003';
select public.redeem_circle_invite((select invite_token from contact_invite));
select is(
  (select count(*) from public.connections where status = 'accepted'),
  2::bigint,
  'redeeming a contact link creates an accepted connection'
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
create temporary table circle_room as
select * from public.create_decision_session(
  'watch',
  '[{"id":"arrival","mode":"watch","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]}]'::jsonb,
  'US'
);
select public.invite_connection_to_session(
  (select session_id from circle_room),
  (select id from first_connection)
);

set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_pending_room_invitations()),
  1::bigint,
  'recipient sees their pending room invitation'
);
select * from public.respond_room_invitation(
  (select id from public.room_invitations where session_id = (select session_id from circle_room)),
  true
);
select is(
  (select status from public.sessions where id = (select session_id from circle_room)),
  'active',
  'accepting a room invitation activates the room'
);
select is(
  (select count(*) from public.participants where session_id = (select session_id from circle_room)),
  2::bigint,
  'accepted room has exactly two participants'
);
select is(
  (select count(*) from public.notification_outbox),
  2::bigint,
  'connection and room events are queued for push delivery'
);

select * from finish();
rollback;
