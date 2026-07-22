begin;
select plan(13);

select has_table('public', 'user_notifications');
select has_column('public', 'user_notifications', 'read_at');
select has_function('public', 'mark_notifications_read', array['bigint[]']);
select has_function('public', 'unread_notification_count', array[]::text[]);
select ok(
  has_function_privilege('authenticated', 'public.mark_notifications_read(bigint[])', 'execute'),
  'authenticated users can mark their own notifications read'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_notifications', 'insert'),
  'clients cannot create inbox events'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select public.validate_decision_deck(
    'custom',
    '[{"id":"one","mode":"custom","title":"One","kicker":"HELP ME PICK","meta":"CUSTOM","description":"Help me pick","background":"#20344A","accent":"#F0B7A4","tags":["Custom"]},{"id":"two","mode":"custom","title":"Two","kicker":"HELP ME PICK","meta":"CUSTOM","description":"Help me pick","background":"#173F42","accent":"#78D6C6","tags":["Custom"],"imageUrl":"https://example.com/two.jpg"}]'::jsonb
  ) $$,
  'custom text and HTTPS image items validate'
);
select throws_ok(
  $$ select public.validate_decision_deck(
    'custom',
    '[{"id":"one","mode":"custom","title":"One","kicker":"PICK","meta":"CUSTOM","description":"Pick","background":"#20344A","accent":"#F0B7A4","tags":["Custom"],"imageUrl":"http://example.com/one.jpg"}]'::jsonb
  ) $$,
  '22023',
  'invalid_deck_item',
  'custom images must use HTTPS'
);

reset role;
insert into public.notification_outbox (recipient_user_id, kind, payload, dedupe_key)
values (
  '90000000-0000-0000-0000-000000000001',
  'room_invitation',
  '{"mode":"custom"}'::jsonb,
  'custom-notification-test'
);
select is(
  (select count(*) from public.user_notifications where dedupe_key = 'custom-notification-test'),
  1::bigint,
  'outbox event is archived in the recipient inbox'
);

set local role authenticated;
set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';
select is(public.unread_notification_count(), 1, 'unread count includes new event');
select is(public.mark_notifications_read(null), 1, 'mark all read updates the event');
select is(public.unread_notification_count(), 0, 'read event leaves unread count');
select is((select count(*) from public.user_notifications), 1::bigint, 'recipient can read their inbox');

select * from finish();
rollback;
