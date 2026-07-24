begin;
select plan(21);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now()),
  ('15000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', true, now(), now());

select has_column(
  'public',
  'chat_invitations',
  'manual_code_hash',
  'manual fallback codes are represented only by a hash'
);
select has_function('public', 'create_chat_invitation_v2', array['text']);
select has_function(
  'public',
  'join_chat_invitation_v2',
  array['text', 'text', 'text']
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_chat_invitation_internal(text)',
    'EXECUTE'
  ),
  'clients cannot call the internal invitation creator'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.join_chat_invitation_by_hash(text,text)',
    'EXECUTE'
  ),
  'clients cannot bypass invitation method validation'
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000001';
create temporary table code_invite as
select *
from public.create_chat_invitation_v2(
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
);

select matches(
  (select invitation_token from code_invite),
  '^[0-9a-f]{64}$',
  'quick link uses a 256-bit opaque token'
);
select matches(
  (select invitation_code from code_invite),
  '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$',
  'manual fallback is a 64-bit formatted code'
);
select ok(
  (select invitation_expires_at from code_invite)
    between now() + interval '60 seconds' and now() + interval '120 seconds',
  'all invitation representations share the short expiry'
);
select isnt(
  (
    select token_hash
    from public.chat_invitations
    where room_id = (select room_id from code_invite)
  ),
  (select invitation_token from code_invite),
  'the quick-link token is not stored in plaintext'
);
select isnt(
  (
    select manual_code_hash
    from public.chat_invitations
    where room_id = (select room_id from code_invite)
  ),
  lower(replace((select invitation_code from code_invite), '-', '')),
  'the manual code is not stored in plaintext'
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000002';
create temporary table code_joined as
select *
from public.join_chat_invitation_v2(
  (select invitation_code from code_invite),
  'code',
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
);

select is(
  (select room_id from code_joined),
  (select room_id from code_invite),
  'manual code redeems the intended invitation'
);
select is(
  (
    select count(*)
    from public.chat_participants
    where room_id = (select room_id from code_invite)
  ),
  2::bigint,
  'code redemption still admits exactly two participants'
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000003';
select throws_ok(
  format(
    'select * from public.join_chat_invitation_v2(%L, %L, %L)',
    (select invitation_code from code_invite),
    'code',
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  'P0001',
  'chat_invitation_unavailable',
  'a consumed manual code cannot be replayed'
);
select throws_ok(
  format(
    'select * from public.join_chat_invitation_v2(%L, %L, %L)',
    (select invitation_token from code_invite),
    'token',
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  'P0001',
  'chat_invitation_unavailable',
  'consuming the code also invalidates the link and QR token'
);
select throws_ok(
  $$ select * from public.join_chat_invitation_v2(
       'ABCD-EFGH-IJKL-MNOP',
       'code',
       'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
     ) $$,
  '22023',
  'invalid_chat_invitation_code',
  'non-hex or malformed manual codes fail before lookup'
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000002';
select lives_ok(
  format(
    'select public.destroy_chat_room(%L)',
    (select room_id from code_invite)
  ),
  'the joined room remains participant-destructible'
);
select is(
  (select count(*) from public.chat_invitations),
  0::bigint,
  'destruction purges token and code hashes'
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000003';
create temporary table link_invite as
select *
from public.create_chat_invitation_v2(
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
);

set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000004';
select lives_ok(
  format(
    'select * from public.join_chat_invitation_v2(%L, %L, %L)',
    (select invitation_token from link_invite),
    'token',
    'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD='
  ),
  'the private link and QR continue to redeem by high-entropy token'
);
select is(
  (
    select count(*)
    from public.chat_participants
    where room_id = (select room_id from link_invite)
  ),
  2::bigint,
  'token redemption remains strictly two-person'
);

set local role authenticated;
select throws_ok(
  $$ select count(*) from public.chat_invitations $$,
  '42501',
  null,
  'authenticated clients cannot read live invitation hashes or codes'
);
select throws_ok(
  $$ insert into public.chat_invitations (
       room_id,
       token_hash,
       manual_code_hash,
       expires_at
     ) values (
       gen_random_uuid(),
       repeat('a', 64),
       repeat('b', 64),
       now() + interval '90 seconds'
     ) $$,
  '42501',
  null,
  'authenticated clients cannot create invitation records directly'
);

select * from finish();
rollback;
