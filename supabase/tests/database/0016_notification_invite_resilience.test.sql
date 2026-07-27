begin;
select plan(4);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
select * from public.upsert_choosr_profile('Invite Sender', 'invite_sender');

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
select * from public.upsert_choosr_profile('Invite Recipient', 'invite_recipient');

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
create temporary table resilient_connection as
select public.send_connection_request('invite_recipient') as id;

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
select public.respond_connection((select id from resilient_connection), true);

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
create temporary table resilient_room as
select * from public.create_decision_session(
  'custom',
  '[{"id":"arrival","mode":"custom","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]}]'::jsonb,
  'US'
);
select public.invite_connection_to_session(
  (select session_id from resilient_room),
  (select id from resilient_connection)
);

set local request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_pending_room_invitations()),
  1::bigint,
  'room invitation is independently discoverable before inbox deletion'
);

select is(
  public.delete_notifications(
    array[
      (
        select id
        from public.user_notifications
        where kind = 'room_invitation'
          and payload->>'session_id' = (select session_id from resilient_room)::text
      )
    ]::bigint[]
  ),
  1,
  'recipient can clear the room notification'
);

select is(
  (select count(*) from public.list_pending_room_invitations()),
  1::bigint,
  'clearing the notification does not clear the pending room invitation'
);

select is(
  (
    select status
    from public.room_invitations
    where session_id = (select session_id from resilient_room)
  ),
  'pending',
  'the underlying invitation remains pending until explicitly answered'
);

select * from finish();
rollback;
