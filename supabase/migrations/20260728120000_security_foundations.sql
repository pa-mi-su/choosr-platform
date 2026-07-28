-- Production security foundations.
--
-- These controls live in Postgres so they continue to apply to modified,
-- outdated, or malicious clients. The mobile UI may explain a limit, but it is
-- never the enforcement boundary.

create table private.security_rate_limits (
  actor_key text not null,
  action text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (actor_key, action, window_started_at)
);

create index security_rate_limits_updated_at_idx
  on private.security_rate_limits (updated_at);

create table private.account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  reason_code text,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_controls_reason_bounded check (
    reason_code is null or length(reason_code) between 1 and 80
  )
);

create table private.security_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z0-9_]{3,80}$'),
  resource_type text check (
    resource_type is null or resource_type ~ '^[a-z0-9_]{2,60}$'
  ),
  resource_id uuid,
  outcome text not null default 'accepted'
    check (outcome in ('accepted', 'rejected', 'blocked')),
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 4096
    ),
  created_at timestamptz not null default now()
);

create index security_events_actor_created_idx
  on private.security_events (actor_user_id, created_at desc);
create index security_events_type_created_idx
  on private.security_events (event_type, created_at desc);

create table private.edge_response_cache (
  cache_key text primary key,
  payload jsonb not null check (
    octet_length(payload::text) <= 262144
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index edge_response_cache_expires_at_idx
  on private.edge_response_cache (expires_at);

revoke all on table private.security_rate_limits
from public, anon, authenticated;
revoke all on table private.account_controls
from public, anon, authenticated;
revoke all on table private.security_events
from public, anon, authenticated;
revoke all on table private.edge_response_cache
from public, anon, authenticated;

create function private.consume_rate_limit(
  p_actor_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_attempts integer;
begin
  if p_actor_key is null
     or length(p_actor_key) not between 1 and 200
     or p_action !~ '^[a-z0-9_]{3,80}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 2592000 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
      * p_window_seconds
  );

  insert into private.security_rate_limits (
    actor_key,
    action,
    window_started_at,
    attempts,
    updated_at
  )
  values (p_actor_key, p_action, v_window_started_at, 1, now())
  on conflict (actor_key, action, window_started_at) do update
  set attempts = private.security_rate_limits.attempts + 1,
      updated_at = now()
  where private.security_rate_limits.attempts < p_limit
  returning attempts into v_attempts;

  return v_attempts is not null;
end;
$$;

create function private.assert_account_active(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_control private.account_controls%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select control.* into v_control
  from private.account_controls control
  where control.user_id = p_user_id;

  if v_control.status = 'closed'
     or (
       v_control.status = 'suspended'
       and (
         v_control.suspended_until is null
         or v_control.suspended_until > now()
       )
     ) then
    raise exception using errcode = '42501', message = 'account_unavailable';
  end if;
end;
$$;

create function private.account_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from private.account_controls control
    where control.user_id = p_user_id
      and (
        control.status = 'closed'
        or (
          control.status = 'suspended'
          and (
            control.suspended_until is null
            or control.suspended_until > now()
          )
        )
      )
  );
$$;

create function private.check_request_account()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is not null then
    perform private.assert_account_active(v_user_id);
  end if;
end;
$$;

create function private.record_security_event(
  p_actor_user_id uuid,
  p_event_type text,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_outcome text default 'accepted',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.security_events (
    actor_user_id,
    event_type,
    resource_type,
    resource_id,
    outcome,
    metadata
  )
  values (
    p_actor_user_id,
    p_event_type,
    p_resource_type,
    p_resource_id,
    p_outcome,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.consume_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
revoke all on function private.assert_account_active(uuid)
from public, anon, authenticated;
revoke all on function private.account_is_active(uuid)
from public, anon, authenticated;
revoke all on function private.check_request_account()
from public, anon, authenticated;
revoke all on function private.record_security_event(
  uuid, text, text, uuid, text, jsonb
) from public, anon, authenticated;

create function public.is_permanent_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select not auth_user.is_anonymous
      from auth.users auth_user
      where auth_user.id = (select auth.uid())
    ),
    false
  );
$$;

create function public.identity_status()
returns table (
  is_anonymous boolean,
  can_recover boolean,
  account_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth_user.is_anonymous,
    not auth_user.is_anonymous,
    coalesce(control.status, 'active')
  from auth.users auth_user
  left join private.account_controls control
    on control.user_id = auth_user.id
  where auth_user.id = (select auth.uid());
$$;

revoke all on function public.is_permanent_identity() from public;
revoke all on function public.identity_status() from public;
grant execute on function public.is_permanent_identity() to authenticated;
grant execute on function public.identity_status() to authenticated;

create function private.enforce_mutation_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_expected_actor uuid;
  v_action text := tg_argv[0];
  v_limit integer := tg_argv[1]::integer;
  v_window_seconds integer := tg_argv[2]::integer;
  v_actor_column text := nullif(tg_argv[3], '');
begin
  -- Service-role maintenance and trusted database jobs do not carry an end-user
  -- auth.uid(). Edge Functions have a separate service-only limiter below.
  if v_actor_user_id is null then
    return new;
  end if;

  perform private.assert_account_active(v_actor_user_id);

  if v_actor_column is not null then
    v_expected_actor :=
      nullif(to_jsonb(new)->>v_actor_column, '')::uuid;
    if v_expected_actor is distinct from v_actor_user_id then
      raise exception using errcode = '42501', message = 'actor_mismatch';
    end if;
  end if;

  if not private.consume_rate_limit(
    v_actor_user_id::text,
    v_action,
    v_limit,
    v_window_seconds
  ) then
    raise exception using
      errcode = '54000',
      message = v_action || '_rate_limited';
  end if;

  insert into private.anonymous_user_activity (auth_user_id, last_active_at)
  values (v_actor_user_id, now())
  on conflict (auth_user_id) do update
  set last_active_at = greatest(
    private.anonymous_user_activity.last_active_at,
    excluded.last_active_at
  );

  return new;
end;
$$;

revoke all on function private.enforce_mutation_security()
from public, anon, authenticated;

create trigger sessions_security_boundary
before insert on public.sessions
for each row execute function private.enforce_mutation_security(
  'session_create', '20', '86400', 'host_user_id'
);

create trigger connections_security_boundary
before insert on public.connections
for each row execute function private.enforce_mutation_security(
  'connection_create', '20', '3600', ''
);

create trigger circle_invites_security_boundary
before insert on public.circle_invites
for each row execute function private.enforce_mutation_security(
  'circle_invite_create', '20', '3600', 'sender_user_id'
);

create trigger room_invitations_security_boundary
before insert on public.room_invitations
for each row execute function private.enforce_mutation_security(
  'room_invite_create', '30', '3600', 'sender_user_id'
);

create trigger profiles_create_security_boundary
before insert on public.profiles
for each row execute function private.enforce_mutation_security(
  'profile_create', '8', '86400', 'user_id'
);

create trigger profiles_identity_update_security_boundary
before update of display_name, handle on public.profiles
for each row
when (
  old.display_name is distinct from new.display_name
  or old.handle is distinct from new.handle
)
execute function private.enforce_mutation_security(
  'profile_identity_update', '10', '86400', 'user_id'
);

create function public.consume_edge_rate_limit(
  p_actor_key text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.consume_rate_limit(
    p_actor_key,
    'edge_' || p_action,
    p_limit,
    p_window_seconds
  );
$$;

revoke all on function public.consume_edge_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(
  text, text, integer, integer
) to service_role;

create function public.edge_account_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_is_active(p_user_id);
$$;

revoke all on function public.edge_account_is_active(uuid)
from public, anon, authenticated;
grant execute on function public.edge_account_is_active(uuid)
to service_role;

create function public.set_account_control(
  p_user_id uuid,
  p_status text,
  p_reason_code text default null,
  p_suspended_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(p_status));
  v_reason_code text := nullif(lower(btrim(p_reason_code)), '');
begin
  if p_user_id is null
     or v_status not in ('active', 'suspended', 'closed')
     or (v_reason_code is not null and length(v_reason_code) > 80)
     or (
       v_status = 'suspended'
       and p_suspended_until is not null
       and p_suspended_until <= now()
     ) then
    raise exception using errcode = '22023', message = 'invalid_account_control';
  end if;

  insert into private.account_controls (
    user_id,
    status,
    reason_code,
    suspended_until
  )
  values (
    p_user_id,
    v_status,
    v_reason_code,
    case when v_status = 'suspended' then p_suspended_until else null end
  )
  on conflict (user_id) do update
  set status = excluded.status,
      reason_code = excluded.reason_code,
      suspended_until = excluded.suspended_until,
      updated_at = now();

  perform private.record_security_event(
    p_user_id,
    'account_control_changed',
    'account',
    p_user_id,
    case when v_status = 'active' then 'accepted' else 'blocked' end,
    jsonb_build_object('status', v_status, 'reason_code', v_reason_code)
  );
end;
$$;

revoke all on function public.set_account_control(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.set_account_control(
  uuid, text, text, timestamptz
) to service_role;

create function public.get_edge_cached_response(p_cache_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select cache.payload
  from private.edge_response_cache cache
  where cache.cache_key = p_cache_key
    and cache.expires_at > now();
$$;

create function public.put_edge_cached_response(
  p_cache_key text,
  p_payload jsonb,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_cache_key is null
     or length(p_cache_key) not between 16 and 200
     or p_payload is null
     or jsonb_typeof(p_payload) not in ('object', 'array')
     or octet_length(p_payload::text) > 262144
     or p_ttl_seconds not between 30 and 86400 then
    raise exception using errcode = '22023', message = 'invalid_cache_entry';
  end if;

  insert into private.edge_response_cache (cache_key, payload, expires_at)
  values (p_cache_key, p_payload, now() + make_interval(secs => p_ttl_seconds))
  on conflict (cache_key) do update
  set payload = excluded.payload,
      expires_at = excluded.expires_at,
      created_at = now();
end;
$$;

revoke all on function public.get_edge_cached_response(text)
from public, anon, authenticated;
revoke all on function public.put_edge_cached_response(text, jsonb, integer)
from public, anon, authenticated;
grant execute on function public.get_edge_cached_response(text)
to service_role;
grant execute on function public.put_edge_cached_response(
  text, jsonb, integer
) to service_role;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'harassment', 'unsafe_content', 'impersonation', 'other')
  ),
  details text check (
    details is null or length(btrim(details)) between 1 and 500
  ),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint user_reports_distinct_people check (
    reporter_user_id <> reported_user_id
  )
);

create index user_reports_status_created_idx
  on public.user_reports (status, created_at);
create index user_reports_reported_created_idx
  on public.user_reports (reported_user_id, created_at desc);

alter table public.user_reports enable row level security;
revoke all on public.user_reports from public, anon, authenticated;

create function public.report_user(
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_user_id uuid := (select auth.uid());
  v_report_id uuid;
  v_reason text := lower(btrim(p_reason));
  v_details text := nullif(btrim(p_details), '');
  v_has_relationship boolean;
begin
  perform private.assert_account_active(v_reporter_user_id);

  if p_reported_user_id is null
     or p_reported_user_id = v_reporter_user_id then
    raise exception using errcode = '22023', message = 'invalid_report_target';
  end if;
  if v_reason not in (
    'spam', 'harassment', 'unsafe_content', 'impersonation', 'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_report_reason';
  end if;
  if v_details is not null and length(v_details) > 500 then
    raise exception using errcode = '22023', message = 'report_details_too_long';
  end if;
  if not private.consume_rate_limit(
    v_reporter_user_id::text,
    'user_report',
    5,
    86400
  ) then
    raise exception using errcode = '54000', message = 'user_report_rate_limited';
  end if;

  select
    exists (
      select 1
      from public.connections connection
      where (
        connection.requester_user_id = v_reporter_user_id
        and connection.addressee_user_id = p_reported_user_id
      ) or (
        connection.requester_user_id = p_reported_user_id
        and connection.addressee_user_id = v_reporter_user_id
      )
    )
    or exists (
      select 1
      from public.participants reporter
      join public.participants reported
        on reported.session_id = reporter.session_id
      where reporter.auth_user_id = v_reporter_user_id
        and reported.auth_user_id = p_reported_user_id
    )
  into v_has_relationship;

  if not v_has_relationship then
    raise exception using errcode = '42501', message = 'report_target_unavailable';
  end if;

  insert into public.user_reports (
    reporter_user_id,
    reported_user_id,
    reason,
    details
  )
  values (
    v_reporter_user_id,
    p_reported_user_id,
    v_reason,
    v_details
  )
  returning id into v_report_id;

  perform private.record_security_event(
    v_reporter_user_id,
    'user_report_created',
    'user_report',
    v_report_id,
    'accepted',
    jsonb_build_object('reason', v_reason)
  );
  return v_report_id;
end;
$$;

revoke all on function public.report_user(uuid, text, text) from public;
grant execute on function public.report_user(uuid, text, text)
to authenticated;

-- A Circle profile is not a permanent account. Anonymous identities with a
-- profile receive a longer inactivity window, but are still cleaned up unless
-- they link a recoverable identity.
create or replace function public.cleanup_stale_anonymous_users(
  p_retention interval default interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_retention < interval '30 days' then
    raise exception using
      errcode = '22023',
      message = 'anonymous_retention_must_be_at_least_30_days';
  end if;

  delete from auth.users as auth_user
  where auth_user.is_anonymous is true
    and coalesce(
      (
        select activity.last_active_at
        from private.anonymous_user_activity activity
        where activity.auth_user_id = auth_user.id
      ),
      auth_user.last_sign_in_at,
      auth_user.created_at
    ) < now() - p_retention
    and not exists (
      select 1
      from public.participants participant
      join public.sessions session on session.id = participant.session_id
      where participant.auth_user_id = auth_user.id
        and session.status in ('waiting', 'active')
        and session.expires_at > now()
    )
    and not exists (
      select 1
      from public.chat_active_memberships membership
      join public.chat_rooms room on room.id = membership.room_id
      where membership.user_id = auth_user.id
        and room.status in ('inviting', 'active')
        and room.expires_at > now()
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function private.cleanup_security_records()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_rows integer;
begin
  delete from private.security_rate_limits
  where updated_at < now() - interval '7 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from private.security_events
  where created_at < now() - interval '180 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from private.edge_response_cache
  where expires_at < now();
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  -- GoTrue resolves phone-change OTPs by the pending phone value. Clearing
  -- abandoned anonymous attempts prevents two pending rows from becoming
  -- ambiguous while leaving active verification windows untouched.
  update auth.users
  set phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null,
      updated_at = now()
  where is_anonymous is true
    and nullif(phone_change, '') is not null
    and phone_change_sent_at < now() - interval '30 minutes';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_security_records()
from public, anon, authenticated;

select cron.schedule(
  'choosr-security-record-cleanup',
  '23 5 * * *',
  $job$ select private.cleanup_security_records(); $job$
);

comment on table private.account_controls is
  'Service-managed account state checked inside sensitive database mutations.';
comment on table private.security_events is
  'Bounded, non-content security audit trail; never stores tokens or message bodies.';
comment on table public.user_reports is
  'User safety reports. RLS blocks client reads; only the validated report_user RPC accepts inserts.';

-- PostgREST invokes this before every Data API request. It closes the gap
-- between an administrative suspension and expiration of an already-issued
-- access token. Trusted service-role maintenance has no auth.uid() and passes.
alter role authenticator
  set pgrst.db_pre_request = 'private.check_request_account';
notify pgrst, 'reload config';
