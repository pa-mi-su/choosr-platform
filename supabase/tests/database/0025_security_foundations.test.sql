begin;
select plan(26);

select has_table(
  'private',
  'security_rate_limits',
  'rate-limit ledger is private'
);
select has_table(
  'private',
  'account_controls',
  'account controls are private'
);
select has_table(
  'private',
  'security_events',
  'security audit trail is private'
);
select has_table('public', 'user_reports', 'user safety reports exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_reports'::regclass),
  'user reports enforce RLS'
);
select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and not relation.relrowsecurity
  ),
  0::bigint,
  'every public application table enforces RLS'
);
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
  ),
  0::bigint,
  'anonymous JWTs have no direct application table privileges'
);
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'
  ),
  0::bigint,
  'authenticated clients cannot mutate application tables directly'
);
select has_function(
  'public',
  'consume_edge_rate_limit',
  array['text', 'text', 'integer', 'integer']
);
select has_function(
  'public',
  'report_user',
  array['uuid', 'text', 'text']
);

select is(
  public.consume_edge_rate_limit('test:actor', 'test', 2, 60),
  true,
  'first Edge request is accepted'
);
select is(
  public.consume_edge_rate_limit('test:actor', 'test', 2, 60),
  true,
  'second Edge request is accepted'
);
select is(
  public.consume_edge_rate_limit('test:actor', 'test', 2, 60),
  false,
  'request above the limit is rejected atomically'
);

select results_eq(
  $$ select count(*)::bigint
     from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name in (
         'consume_edge_rate_limit',
         'get_edge_cached_response',
         'put_edge_cached_response'
       )
       and grantee in ('anon', 'authenticated') $$,
  array[0::bigint],
  'clients cannot invoke trusted Edge helpers'
);
select results_eq(
  $$ select count(*)::bigint
     from information_schema.role_routine_grants
     where routine_schema = 'public'
       and routine_name = 'set_account_control'
       and grantee in ('anon', 'authenticated') $$,
  array[0::bigint],
  'clients cannot change account controls'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', false, now(), now()),
  ('90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';
select is(public.is_permanent_identity(), false, 'anonymous identity is identified');
select results_eq(
  $$ select is_anonymous, can_recover, account_status
     from public.identity_status() $$,
  $$ values (true, false, 'active'::text) $$,
  'anonymous identity reports its recovery boundary'
);
select * from public.upsert_choosr_profile('Reporter', 'reporter_one');

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000002';
select is(public.is_permanent_identity(), true, 'linked identity is permanent');
select * from public.upsert_choosr_profile('Reported', 'reported_two');

set local request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';
create temporary table security_connection as
select public.send_connection_request('reported_two') as id;
select lives_ok(
  $$ select public.report_user(
       '90000000-0000-0000-0000-000000000002',
       'spam',
       'Repeated unwanted requests'
     ) $$,
  'a user can report someone they have interacted with'
);
select is(
  (select count(*) from public.user_reports),
  1::bigint,
  'validated report is stored once'
);
select is(
  (select count(*) from private.security_events where event_type = 'user_report_created'),
  1::bigint,
  'report creates a bounded security event'
);

select is(
  public.send_connection_request('missing_handle'),
  null::uuid,
  'unavailable handles return no identifier'
);
select is(
  (
    select attempts
    from private.security_rate_limits
    where actor_key = '90000000-0000-0000-0000-000000000001'
      and action = 'handle_lookup_attempt'
  ),
  2,
  'successful and failed handle lookups both consume the enforced budget'
);

select throws_ok(
  $$ select public.report_user(
       '90000000-0000-0000-0000-000000000003',
       'spam',
       null
     ) $$,
  '42501',
  'report_target_unavailable',
  'unrelated user identifiers cannot be probed through reporting'
);

insert into private.account_controls (user_id, status, reason_code)
values (
  '90000000-0000-0000-0000-000000000001',
  'suspended',
  'automated_test'
);
select throws_ok(
  $$ select * from public.upsert_choosr_profile(
       'Blocked Reporter',
       'blocked_reporter'
     ) $$,
  '42501',
  'account_unavailable',
  'suspended users are blocked at the database boundary'
);

select results_eq(
  $$ select count(*)::bigint from cron.job
     where jobname in (
       'choosr-security-record-cleanup',
       'choosr-storage-cleanup'
     ) $$,
  array[2::bigint],
  'security and storage retention jobs are scheduled'
);

select * from finish();
rollback;
