alter table public.notification_outbox
  add column processing_started_at timestamptz,
  add column last_error text;

create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where delivered_at is null;

create function public.claim_notification_jobs(p_limit integer default 25)
returns table (
  id bigint,
  recipient_user_id uuid,
  kind text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with pending as (
    select n.id
    from public.notification_outbox n
    where n.delivered_at is null
      and (
        n.processing_started_at is null
        or n.processing_started_at < now() - interval '5 minutes'
      )
    order by n.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_outbox n
  set processing_started_at = now(),
      attempts = n.attempts + 1,
      last_error = null
  from pending
  where n.id = pending.id
  returning n.id, n.recipient_user_id, n.kind, n.payload, n.attempts;
end;
$$;

create function public.complete_notification_job(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set delivered_at = now(),
      processing_started_at = null,
      last_error = null
  where id = p_id and delivered_at is null;
$$;

create function public.fail_notification_job(p_id bigint, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set processing_started_at = null,
      last_error = left(coalesce(p_error, 'Push delivery failed.'), 500)
  where id = p_id and delivered_at is null;
$$;

revoke all on function public.claim_notification_jobs(integer) from public;
revoke all on function public.complete_notification_job(bigint) from public;
revoke all on function public.fail_notification_job(bigint, text) from public;

grant execute on function public.claim_notification_jobs(integer) to service_role;
grant execute on function public.complete_notification_job(bigint) to service_role;
grant execute on function public.fail_notification_job(bigint, text) to service_role;
grant select, delete on public.device_push_tokens to service_role;

comment on function public.claim_notification_jobs(integer) is
  'Atomically leases undelivered push jobs to a service-role worker using SKIP LOCKED.';
