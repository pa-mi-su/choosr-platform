begin;
select plan(12);

select has_column('public', 'connections', 'removed_at', 'connections track removal');
select has_function('public', 'remove_circle_connection', array['uuid']);
select has_column('public', 'user_notifications', 'deleted_at', 'notifications support soft deletion');
select has_function('public', 'delete_notifications', array['bigint[]']);
select ok(
  array_position(
    (select allowed_mime_types from storage.buckets where id = 'profile-photos'),
    'image/webp'
  ) is not null,
  'profile photos allow normalized WebP images'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select * from public.upsert_choosr_profile('Removal One', 'removal_one');
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select * from public.upsert_choosr_profile('Removal Two', 'removal_two');
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
create temporary table removal_connection as
select public.send_connection_request('removal_two') as id;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select public.respond_connection((select id from removal_connection), true);
select public.remove_circle_connection((select id from removal_connection));

select is(
  (select status from public.connections where id = (select id from removal_connection)),
  'removed',
  'removing a Circle member preserves the relationship audit row'
);
select isnt(
  (select removed_at from public.connections where id = (select id from removal_connection)),
  null,
  'removing a Circle member records when it happened'
);
select is((select count(*) from public.list_circle()), 0::bigint, 'removed people disappear from the Circle');

create temporary table notification_baseline as
select public.unread_notification_count() as unread;

insert into public.user_notifications (
  recipient_user_id, kind, title, body, dedupe_key
) values (
  'a0000000-0000-0000-0000-000000000002',
  'connection_request',
  'Test',
  'Delete this notification',
  'uat-bug-sweep-delete'
);
select is(
  public.unread_notification_count(),
  (select unread + 1 from notification_baseline),
  'undeleted notification is unread'
);
select is(
  public.delete_notifications(
    array[(select id from public.user_notifications where dedupe_key = 'uat-bug-sweep-delete')]::bigint[]
  ),
  1,
  'selected notification is soft-deleted'
);
select is(
  public.unread_notification_count(),
  (select unread from notification_baseline),
  'deleted notification is not unread'
);
select isnt(
  (select deleted_at from public.user_notifications where dedupe_key = 'uat-bug-sweep-delete'),
  null,
  'deleted notification remains as an audit row'
);

select * from finish();
rollback;
