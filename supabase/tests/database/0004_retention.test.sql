begin;
select plan(10);

select has_function(
  'public',
  'cleanup_stale_anonymous_users',
  array['interval'],
  'anonymous retention function exists'
);

select has_table(
  'private',
  'anonymous_user_activity',
  'private activity ledger exists'
);

select results_eq(
  $$ select count(*)::bigint from cron.job
     where jobname in (
       'choosr-expired-room-cleanup',
       'choosr-stale-anonymous-user-cleanup'
     ) $$,
  array[2::bigint],
  'both retention jobs are scheduled'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now() - interval '45 days', now() - interval '45 days'),
  ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now() - interval '45 days', now() - interval '45 days'),
  ('40000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now() - interval '45 days', now() - interval '45 days'),
  ('40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', false, now() - interval '45 days', now() - interval '45 days');

insert into private.anonymous_user_activity (auth_user_id, last_active_at)
values
  ('40000000-0000-0000-0000-000000000002', now()),
  ('40000000-0000-0000-0000-000000000003', now() - interval '45 days');

insert into public.sessions (
  id, access_code, invite_token_hash, host_user_id, mode, status, expires_at
)
values (
  '41000000-0000-0000-0000-000000000003',
  'SAFEUSER',
  digest('retention-test-token', 'sha256'),
  '40000000-0000-0000-0000-000000000003',
  'watch',
  'active',
  now() + interval '1 hour'
);

insert into public.participants (session_id, auth_user_id, role, last_seen_at)
values (
  '41000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000003',
  'host',
  now() - interval '45 days'
);

select is(
  public.cleanup_stale_anonymous_users(),
  1,
  'cleanup deletes only one stale, inactive anonymous user'
);

select isnt(
  (select id from auth.users where id = '40000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'stale inactive anonymous user is deleted'
);

select is(
  (select id from auth.users where id = '40000000-0000-0000-0000-000000000002'),
  '40000000-0000-0000-0000-000000000002'::uuid,
  'recently active anonymous user is retained'
);

select is(
  (select id from auth.users where id = '40000000-0000-0000-0000-000000000003'),
  '40000000-0000-0000-0000-000000000003'::uuid,
  'anonymous user in a live room is retained'
);

select is(
  (select id from auth.users where id = '40000000-0000-0000-0000-000000000004'),
  '40000000-0000-0000-0000-000000000004'::uuid,
  'permanent user is never deleted'
);

select throws_ok(
  $$ select public.cleanup_stale_anonymous_users(interval '6 days') $$,
  '22023',
  'anonymous_retention_must_be_at_least_7_days',
  'unsafe retention windows are rejected'
);

select results_eq(
  $$ select count(*)::bigint
     from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name = 'cleanup_stale_anonymous_users'
       and grantee in ('anon', 'authenticated') $$,
  array[0::bigint],
  'clients cannot invoke anonymous cleanup'
);

select * from finish();
rollback;
