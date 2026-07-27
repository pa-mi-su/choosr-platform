begin;
select plan(9);

select has_column(
  'public',
  'chat_rooms',
  'decision_session_id',
  'private chats can be authorized by a matched decision room'
);
select has_function(
  'public',
  'open_matched_room_chat',
  array['uuid', 'text'],
  'matched participants share one direct-chat entry point'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('a3000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('a3000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000001';

create temporary table matched_room as
select *
from public.create_decision_session(
  'custom',
  '[
    {"id":"tacos","mode":"custom","title":"Tacos","kicker":"PICK","meta":"Tonight","description":"Dinner","background":"#20344A","accent":"#F0B7A4","tags":["Food"]},
    {"id":"pizza","mode":"custom","title":"Pizza","kicker":"PICK","meta":"Tonight","description":"Dinner","background":"#39464C","accent":"#E9D9BE","tags":["Food"]}
  ]'::jsonb,
  'US'
);

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000002';
select lives_ok(
  format(
    'select * from public.join_session(%L, null)',
    (select access_code from matched_room)
  ),
  'the second decision participant joins'
);

update public.sessions
set status = 'matched',
    completed_at = now()
where id = (select session_id from matched_room);

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000001';
create temporary table creator_chat as
select *
from public.open_matched_room_chat(
  (select session_id from matched_room),
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
);

select is(
  (select status from creator_chat),
  'inviting',
  'the first matched participant creates the waiting encrypted chat'
);
select is(
  (select decision_session_id from creator_chat),
  (select session_id from matched_room),
  'the chat remains bound to the matched decision room'
);

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000002';
create temporary table joiner_chat as
select *
from public.open_matched_room_chat(
  (select session_id from matched_room),
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
);

select is(
  (select status from joiner_chat),
  'active',
  'the other matched participant activates the same chat'
);
select is(
  (select peer_public_key from joiner_chat),
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'the joiner receives only the peer public key needed for encryption'
);
select is(
  (
    select count(*)
    from public.chat_participants
    where room_id = (select room_id from creator_chat)
  ),
  2::bigint,
  'the direct chat contains exactly the matched pair'
);

set local request.jwt.claim.sub = 'a3000000-0000-0000-0000-000000000003';
select throws_ok(
  format(
    'select * from public.open_matched_room_chat(%L, %L)',
    (select session_id from matched_room),
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='
  ),
  '42501',
  'matched_room_chat_unavailable',
  'a non-participant cannot enter the matched private chat'
);

select * from finish();
rollback;
