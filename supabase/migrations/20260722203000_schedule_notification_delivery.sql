-- Push creation writes durable outbox rows. Invoke the dispatcher independently
-- of either mobile client so transient network or FCM failures are retried.

create extension if not exists pg_net with schema extensions;

create function private.dispatch_pending_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_publishable_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'choosr_project_url';

  select decrypted_secret into v_publishable_key
  from vault.decrypted_secrets
  where name = 'choosr_publishable_key';

  -- Local tests and a newly provisioned hosted project may apply migrations
  -- before CI has populated Vault. In that state the worker safely does nothing.
  if v_project_url is null or v_publishable_key is null then
    return null;
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_publishable_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_pending_notifications() from public;

select cron.schedule(
  'choosr-notification-dispatch',
  '* * * * *',
  $job$ select private.dispatch_pending_notifications(); $job$
);

comment on function private.dispatch_pending_notifications() is
  'Invokes the push dispatcher every minute using encrypted Vault configuration.';
