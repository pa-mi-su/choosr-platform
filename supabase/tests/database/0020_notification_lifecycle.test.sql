begin;
select plan(14);

select has_column(
  'public',
  'notification_outbox',
  'deliver_before',
  'provider delivery has a hard deadline'
);
select has_column(
  'public',
  'notification_outbox',
  'discarded_at',
  'terminally invalid jobs are distinct from delivered jobs'
);
select has_function(
  'public',
  'notification_job_is_deliverable',
  array['bigint'],
  'the worker can revalidate immediately before provider delivery'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.notification_job_is_deliverable(bigint)',
    'execute'
  ),
  'clients cannot probe the private delivery lifecycle'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now()),
  ('f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', true, now(), now()),
  ('f0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', true, now(), now()),
  ('f0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', true, now(), now());

insert into public.profiles (user_id, display_name, handle)
values
  ('f0000000-0000-0000-0000-000000000001', 'Sender', 'sender'),
  ('f0000000-0000-0000-0000-000000000002', 'Recipient', 'recipient');

insert into public.connections (
  id,
  requester_user_id,
  addressee_user_id,
  status,
  responded_at
) values (
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000002',
  'accepted',
  now()
);

set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000001';
create temporary table notification_room as
select *
from public.create_decision_session(
  'watch',
  '[{"id":"arrival","mode":"watch","title":"Arrival","kicker":"FILM","meta":"2016","description":"Science fiction","background":"#39464C","accent":"#E9D9BE","tags":["Sci-Fi"]}]'::jsonb,
  'US'
);
select public.invite_connection_to_session(
  (select session_id from notification_room),
  'f1000000-0000-0000-0000-000000000001'
);

create temporary table current_invite_lease as
select *
from public.claim_notification_jobs(1);

select is(
  (select count(*) from current_invite_lease),
  1::bigint,
  'a current pending room invitation is leased exactly once'
);
select ok(
  public.notification_job_is_deliverable(
    (select id from current_invite_lease)
  ),
  'the leased invitation is still actionable immediately before send'
);

select public.cancel_session((select session_id from notification_room));
select ok(
  (
    select discarded_at is not null
      and discard_reason = 'invitation_resolved'
      and delivered_at is null
    from public.notification_outbox
    where id = (select id from current_invite_lease)
  ),
  'room cancellation terminally discards even an already-leased invite'
);

set local request.jwt.claim.sub = 'f0000000-0000-0000-0000-000000000002';
select is(
  (select count(*) from public.list_pending_room_invitations()),
  0::bigint,
  'the recipient cannot see a pending invitation for a cancelled room'
);

insert into public.connections (
  id,
  requester_user_id,
  addressee_user_id,
  status
) values (
  'f1000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000003',
  'pending'
);
insert into public.notification_outbox (
  recipient_user_id,
  kind,
  payload,
  dedupe_key,
  created_at,
  deliver_before
) values (
  'f0000000-0000-0000-0000-000000000003',
  'connection_request',
  '{"connection_id":"f1000000-0000-0000-0000-000000000002"}'::jsonb,
  'expired-delivery-window',
  now() - interval '10 minutes',
  now() - interval '5 minutes'
);

select is(
  (select count(*) from public.claim_notification_jobs(1)),
  0::bigint,
  'a provider job is never leased after its delivery window'
);
select is(
  (
    select discard_reason
    from public.notification_outbox
    where dedupe_key = 'expired-delivery-window'
  ),
  'delivery_window_expired',
  'expired delivery is retained with an auditable reason'
);

insert into public.connections (
  id,
  requester_user_id,
  addressee_user_id,
  status
) values (
  'f1000000-0000-0000-0000-000000000003',
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000004',
  'pending'
);
insert into public.notification_outbox (
  recipient_user_id,
  kind,
  payload,
  dedupe_key
) values (
  'f0000000-0000-0000-0000-000000000004',
  'connection_request',
  '{"connection_id":"f1000000-0000-0000-0000-000000000003"}'::jsonb,
  'resolved-connection'
);
update public.connections
set status = 'accepted', responded_at = now()
where id = 'f1000000-0000-0000-0000-000000000003';

select ok(
  (
    select discarded_at is not null
      and discard_reason = 'connection_resolved'
    from public.notification_outbox
    where dedupe_key = 'resolved-connection'
  ),
  'responding to a Circle request discards its pending provider alert'
);
select ok(
  (
    select deleted_at is not null
    from public.user_notifications
    where dedupe_key = 'resolved-connection'
  ),
  'responding also removes the no-longer-actionable inbox event'
);

insert into public.connections (
  id,
  requester_user_id,
  addressee_user_id,
  status
) values (
  'f1000000-0000-0000-0000-000000000004',
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000005',
  'pending'
);
insert into public.notification_outbox (
  recipient_user_id,
  kind,
  payload,
  dedupe_key,
  attempts
) values (
  'f0000000-0000-0000-0000-000000000005',
  'connection_request',
  '{"connection_id":"f1000000-0000-0000-0000-000000000004"}'::jsonb,
  'retry-limit',
  4
);

create temporary table final_retry as
select * from public.claim_notification_jobs(1);
select public.fail_notification_job(
  (select id from final_retry),
  'temporary provider failure'
);
select is(
  (
    select attempts
    from public.notification_outbox
    where dedupe_key = 'retry-limit'
  ),
  5,
  'the retry policy has a fixed maximum attempt count'
);
select is(
  (
    select discard_reason
    from public.notification_outbox
    where dedupe_key = 'retry-limit'
  ),
  'retry_limit_reached',
  'the final failed attempt becomes terminal instead of retrying forever'
);

select * from finish();
rollback;
