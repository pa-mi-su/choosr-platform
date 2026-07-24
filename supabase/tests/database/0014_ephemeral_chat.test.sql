begin;
select plan(45);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('14000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now()),
  ('14000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', true, now(), now());

select has_table('public', 'chat_rooms', 'chat rooms are isolated from Choose sessions');
select has_table('public', 'chat_participants', 'temporary chat participants exist');
select has_table('public', 'chat_invitations', 'one-time chat invitations exist');
select has_table('public', 'chat_messages', 'ciphertext envelope storage exists');
select hasnt_column(
  'public',
  'chat_messages',
  'content',
  'message storage has no plaintext content column'
);
select hasnt_column(
  'public',
  'chat_messages',
  'body',
  'message storage has no plaintext body column'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_rooms'::regclass),
  'chat rooms have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass),
  'chat messages have RLS enabled'
);
select policies_are(
  'public',
  'chat_messages',
  array['chat_messages_select_active_members'],
  'ciphertext has one active-member read policy'
);
select has_function('public', 'destroy_chat_room', array['uuid']);
select has_function('public', 'cleanup_expired_chats', array[]::text[]);
select results_eq(
  $$ select count(*)::bigint
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name like 'chat_%'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE') $$,
  array[0::bigint],
  'authenticated users have no direct chat write grants'
);

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000001';
create temporary table chat_created as
select *
from public.create_chat_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');

select matches(
  (select invitation_token from chat_created),
  '^[0-9a-f]{64}$',
  'QR invitation contains a high-entropy opaque token'
);
select ok(
  (select invitation_expires_at from chat_created)
    between now() + interval '60 seconds' and now() + interval '120 seconds',
  'QR invitation expires within the required 60-120 second window'
);
select is(
  (select count(*) from public.chat_active_memberships),
  1::bigint,
  'creator occupies one active-chat slot'
);
select throws_ok(
  $$ select * from public.create_chat_invitation(
       'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
     ) $$,
  '23505',
  'active_chat_exists',
  'a user cannot create a second active chat'
);

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000002';
create temporary table chat_joined as
select *
from public.join_chat_invitation(
  (select invitation_token from chat_created),
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
);

select is(
  (select status from public.chat_rooms where id = (select room_id from chat_created)),
  'active',
  'valid QR redemption activates the room'
);
select is(
  (select count(*) from public.chat_participants where room_id = (select room_id from chat_created)),
  2::bigint,
  'an active room has exactly two participants'
);
select is(
  (select peer_public_key from chat_joined),
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'joiner receives only the temporary creator public key'
);
select throws_ok(
  format(
    'select * from public.join_chat_invitation(%L, %L)',
    (select invitation_token from chat_created),
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  'P0001',
  'chat_invitation_unavailable',
  'a consumed QR cannot be replayed'
);

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000003';
select throws_ok(
  format(
    'select * from public.join_chat_invitation(%L, %L)',
    (select invitation_token from chat_created),
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  'P0001',
  'chat_invitation_unavailable',
  'a third participant cannot enter through the consumed token'
);

grant select on chat_created, chat_joined to authenticated;
set local role authenticated;
select is(
  (select count(*) from public.chat_rooms),
  0::bigint,
  'a nonparticipant cannot read a room'
);
select is(
  (select count(*) from public.chat_participants),
  0::bigint,
  'a nonparticipant cannot enumerate temporary participants'
);
select throws_ok(
  format(
    'select * from public.send_chat_ciphertext(%L, %L, %L, %L)',
    (select room_id from chat_created),
    '14000000-0000-4000-8000-000000000001',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAA'
  ),
  '42501',
  'chat_not_available',
  'a nonparticipant cannot send ciphertext'
);

reset role;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000001';
select lives_ok(
  format(
    'select * from public.send_chat_ciphertext(%L, %L, %L, %L)',
    (select room_id from chat_created),
    '14000000-0000-4000-8000-000000000002',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'VGhpcyBpcyBhdXRoZW50aWNhdGVkIGNpcGhlcnRleHQu'
  ),
  'a participant can store an authenticated ciphertext envelope'
);
select is(
  (select count(*) from public.chat_messages),
  1::bigint,
  'one ciphertext envelope is stored'
);
select is(
  (select payload from public.notification_outbox where kind = 'chat_message'),
  '{}'::jsonb,
  'chat push payload contains no message preview or room identifier'
);
select is(
  (
    select title || '|' || body
    from public.user_notifications
    where kind = 'chat_message'
  ),
  'New private Choosr message|Open Choosr to view it privately.',
  'durable notification copy is generic'
);
select lives_ok(
  format(
    'select * from public.send_chat_ciphertext(%L, %L, %L, %L)',
    (select room_id from chat_created),
    '14000000-0000-4000-8000-000000000002',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'VGhpcyBpcyBhdXRoZW50aWNhdGVkIGNpcGhlcnRleHQu'
  ),
  'message retry is idempotent'
);
select is(
  (select count(*) from public.chat_messages),
  1::bigint,
  'idempotent retry does not duplicate ciphertext'
);
select throws_ok(
  format(
    'select * from public.send_chat_ciphertext(%L, %L, %L, %L)',
    (select room_id from chat_created),
    '14000000-0000-4000-8000-000000000003',
    'bad-nonce',
    'readable message'
  ),
  '22023',
  'invalid_chat_ciphertext',
  'malformed or readable payloads are rejected'
);

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000002';
select is(
  public.destroy_chat_room((select room_id from chat_created)),
  'destroyed',
  'either participant can atomically destroy the room'
);
select is(
  (select count(*) from public.chat_messages),
  0::bigint,
  'destruction deletes live ciphertext'
);
select is(
  (select count(*) from public.chat_participants),
  0::bigint,
  'destruction deletes participant state'
);
select is(
  (select count(*) from public.chat_invitations),
  0::bigint,
  'destruction invalidates invitations'
);
select is(
  (select count(*) from public.chat_active_memberships),
  0::bigint,
  'destruction releases both active-chat slots'
);
select is(
  public.destroy_chat_room((select room_id from chat_created)),
  'destroyed',
  'destroy retry is idempotent after participant deletion'
);
set local role authenticated;
select is(
  (select count(*) from public.chat_rooms),
  0::bigint,
  'a former participant cannot read a closed room'
);
select is(
  (select count(*) from public.chat_messages),
  0::bigint,
  'a former participant cannot read destroyed ciphertext'
);
select throws_ok(
  format(
    'select * from public.send_chat_ciphertext(%L, %L, %L, %L)',
    (select room_id from chat_created),
    '14000000-0000-4000-8000-000000000004',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'VGhpcyBpcyBhdXRoZW50aWNhdGVkIGNpcGhlcnRleHQu'
  ),
  '42501',
  'chat_not_available',
  'a former participant cannot send after destruction'
);
reset role;

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000003';
select throws_ok(
  format(
    'select public.destroy_chat_room(%L)',
    (select room_id from chat_created)
  ),
  '42501',
  'chat_not_available',
  'a third party cannot destroy another room'
);

set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000004';
create temporary table expiring_chat as
select *
from public.create_chat_invitation('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=');
update public.chat_invitations
set created_at = now() - interval '2 minutes',
    expires_at = now() - interval '1 second'
where room_id = (select room_id from expiring_chat);

select is(
  public.cleanup_expired_chats(),
  1,
  'cleanup destroys an unused room shell when its QR expires'
);
select is(
  (
    select status from public.chat_rooms
    where id = (select room_id from expiring_chat)
  ),
  'expired',
  'expired room is a closed tombstone'
);
select is(
  (select count(*) from public.chat_active_memberships),
  0::bigint,
  'expiration releases the creator active-chat slot'
);
select throws_ok(
  format(
    'select * from public.join_chat_invitation(%L, %L)',
    (select invitation_token from expiring_chat),
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  'P0001',
  'chat_invitation_unavailable',
  'an expired QR cannot be restored'
);

select * from finish();
rollback;
