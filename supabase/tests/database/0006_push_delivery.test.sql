begin;
select plan(18);

select has_extension('pg_net', 'pg_net is available for scheduled dispatch');
select has_function(
  'private',
  'dispatch_pending_notifications',
  array[]::text[],
  'the private scheduled dispatcher exists'
);
select is(
  (select count(*) from cron.job where jobname = 'choosr-notification-dispatch'),
  1::bigint,
  'notification delivery is scheduled independently of mobile clients'
);
select has_trigger(
  'public',
  'notification_outbox',
  'notification_outbox_dispatch_insert',
  'new notification jobs start immediate push dispatch'
);

select has_column(
  'public',
  'notification_outbox',
  'processing_started_at',
  'notification jobs track lease start time'
);
select has_column(
  'public',
  'notification_outbox',
  'last_error',
  'notification jobs retain the last delivery error'
);
select has_column(
  'public',
  'notification_outbox',
  'attempts',
  'notification jobs count delivery attempts'
);
select has_function('public', 'claim_notification_jobs', array['integer']);
select has_function('public', 'complete_notification_job', array['bigint']);
select has_function('public', 'fail_notification_job', array['bigint', 'text']);

select ok(
  not has_function_privilege('authenticated', 'public.claim_notification_jobs(integer)', 'execute'),
  'authenticated clients cannot lease push jobs'
);
select ok(
  has_function_privilege('service_role', 'public.claim_notification_jobs(integer)', 'execute'),
  'only the service worker can lease push jobs'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values ('60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());

insert into public.notification_outbox (
  recipient_user_id,
  kind,
  payload,
  dedupe_key
) values (
  '60000000-0000-0000-0000-000000000001',
  'connection_request',
  '{}'::jsonb,
  'push-worker-test'
);

create temporary table first_lease as
select * from public.claim_notification_jobs(1);

select is((select count(*) from first_lease), 1::bigint, 'one pending job is leased');
select is((select attempts from first_lease), 1, 'leasing increments attempts');
select ok(
  (select processing_started_at is not null from public.notification_outbox where dedupe_key = 'push-worker-test'),
  'leased job records its lease timestamp'
);

select public.fail_notification_job((select id from first_lease), 'temporary failure');
select ok(
  (select processing_started_at is null and last_error = 'temporary failure'
   from public.notification_outbox where dedupe_key = 'push-worker-test'),
  'failed jobs are released with a diagnostic'
);

select * from public.claim_notification_jobs(1);
select is(
  (select attempts from public.notification_outbox where dedupe_key = 'push-worker-test'),
  2,
  'released jobs can be leased for another attempt'
);

select public.complete_notification_job(
  (select id from public.notification_outbox where dedupe_key = 'push-worker-test')
);
select ok(
  (select delivered_at is not null and processing_started_at is null and last_error is null
   from public.notification_outbox where dedupe_key = 'push-worker-test'),
  'successful delivery finalizes and clears the lease'
);

select * from finish();
rollback;
