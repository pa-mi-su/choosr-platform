-- Push endpoints are operational records, not disposable cache entries.
-- Retain provider failures so an iOS delivery incident can be diagnosed without
-- attaching the recipient's phone to a developer machine.

alter table public.device_push_tokens
  add column invalidated_at timestamptz,
  add column last_delivery_attempt_at timestamptz,
  add column last_delivery_succeeded_at timestamptz,
  add column last_delivery_error text
    constraint device_push_tokens_delivery_error_safe
    check (
      last_delivery_error is null
      or last_delivery_error ~ '^[A-Z0-9_.-]{1,120}$'
    );

create index device_push_tokens_active_user_idx
  on public.device_push_tokens (user_id, updated_at desc)
  where invalidated_at is null;

create table public.push_registration_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null
    constraint push_registration_health_platform_valid
    check (platform in ('ios', 'android')),
  status text not null
    constraint push_registration_health_status_valid
    check (status in ('ready', 'unavailable')),
  stage text not null
    constraint push_registration_health_stage_safe
    check (stage ~ '^[a-z0-9_-]{1,40}$'),
  code text not null
    constraint push_registration_health_code_safe
    check (code ~ '^[A-Za-z0-9_./-]{1,80}$'),
  app_version text not null
    constraint push_registration_health_app_version_safe
    check (app_version ~ '^[A-Za-z0-9_.+-]{1,40}$'),
  build_number text not null
    constraint push_registration_health_build_number_safe
    check (build_number ~ '^[A-Za-z0-9_.+-]{1,40}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.push_registration_health enable row level security;
revoke all on public.push_registration_health from anon, authenticated;
grant select, insert, update on public.push_registration_health to service_role;

create function public.report_push_registration(
  p_platform text,
  p_status text,
  p_stage text,
  p_code text,
  p_app_version text,
  p_build_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_platform not in ('ios', 'android')
     or p_status not in ('ready', 'unavailable')
     or p_stage !~ '^[a-z0-9_-]{1,40}$'
     or p_code !~ '^[A-Za-z0-9_./-]{1,80}$'
     or p_app_version !~ '^[A-Za-z0-9_.+-]{1,40}$'
     or p_build_number !~ '^[A-Za-z0-9_.+-]{1,40}$' then
    raise exception using errcode = '22023', message = 'invalid_push_health';
  end if;

  insert into public.push_registration_health (
    user_id,
    platform,
    status,
    stage,
    code,
    app_version,
    build_number
  )
  values (
    v_user_id,
    p_platform,
    p_status,
    p_stage,
    p_code,
    p_app_version,
    p_build_number
  )
  on conflict (user_id, platform) do update
  set status = excluded.status,
      stage = excluded.stage,
      code = excluded.code,
      app_version = excluded.app_version,
      build_number = excluded.build_number,
      updated_at = now();
end;
$$;

revoke all on function public.report_push_registration(
  text,
  text,
  text,
  text,
  text,
  text
) from public;
grant execute on function public.report_push_registration(
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.register_push_token(
  p_platform text,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text := btrim(p_token);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_platform not in ('ios', 'android')
     or length(v_token) not between 20 and 4096 then
    raise exception using errcode = '22023', message = 'invalid_push_token';
  end if;

  insert into public.device_push_tokens (user_id, platform, token)
  values (v_user_id, p_platform, v_token)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

create function public.push_token_status(p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 'missing'
    when exists (
      select 1
      from public.device_push_tokens token
      where token.user_id = (select auth.uid())
        and token.token = btrim(p_token)
        and token.invalidated_at is null
    ) then 'active'
    when exists (
      select 1
      from public.device_push_tokens token
      where token.user_id = (select auth.uid())
        and token.token = btrim(p_token)
        and token.invalidated_at is not null
    ) then 'invalidated'
    else 'missing'
  end;
$$;

revoke all on function public.push_token_status(text) from public;
grant execute on function public.push_token_status(text) to authenticated;

create or replace function public.has_registered_push_token()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.device_push_tokens token
      where token.user_id = (select auth.uid())
        and token.invalidated_at is null
    );
$$;

revoke all on function public.has_registered_push_token() from public;
grant execute on function public.has_registered_push_token() to authenticated;

comment on table public.push_registration_health is
  'Latest token-registration outcome per identity and platform; contains no push token or private device data.';
comment on function public.report_push_registration(
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Records bounded, non-sensitive client push registration health for remote diagnosis.';
comment on function public.push_token_status(text) is
  'Lets an authenticated installation rotate only a token that FCM has explicitly invalidated.';
