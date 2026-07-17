-- Keep the zero-account MVP within predictable storage limits. Room cleanup is
-- frequent and cheap; anonymous identities are retained for 30 days after their
-- last recorded room activity.

create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.anonymous_user_activity (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  last_active_at timestamptz not null
);

revoke all on table private.anonymous_user_activity
from public, anon, authenticated;

create function private.record_participant_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.anonymous_user_activity (auth_user_id, last_active_at)
  values (new.auth_user_id, new.last_seen_at)
  on conflict (auth_user_id) do update
  set last_active_at = greatest(
    private.anonymous_user_activity.last_active_at,
    excluded.last_active_at
  );
  return new;
end;
$$;

revoke all on function private.record_participant_activity() from public;

create trigger participants_record_anonymous_activity
after insert or update of last_seen_at on public.participants
for each row execute function private.record_participant_activity();

insert into private.anonymous_user_activity (auth_user_id, last_active_at)
select auth_user_id, max(last_seen_at)
from public.participants
group by auth_user_id
on conflict (auth_user_id) do update
set last_active_at = greatest(
  private.anonymous_user_activity.last_active_at,
  excluded.last_active_at
);

create function public.cleanup_stale_anonymous_users(
  p_retention interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_retention < interval '7 days' then
    raise exception using
      errcode = '22023',
      message = 'anonymous_retention_must_be_at_least_7_days';
  end if;

  delete from auth.users as auth_user
  where auth_user.is_anonymous is true
    and coalesce(
      (
        select activity.last_active_at
        from private.anonymous_user_activity as activity
        where activity.auth_user_id = auth_user.id
      ),
      auth_user.created_at
    ) < now() - p_retention
    and not exists (
      select 1
      from public.participants as participant
      join public.sessions as session
        on session.id = participant.session_id
      where participant.auth_user_id = auth_user.id
        and session.status in ('waiting', 'active')
        and session.expires_at > now()
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_stale_anonymous_users(interval)
from public, anon, authenticated;

select cron.schedule(
  'choosr-expired-room-cleanup',
  '17 * * * *',
  $job$ select public.cleanup_expired_sessions(); $job$
);

select cron.schedule(
  'choosr-stale-anonymous-user-cleanup',
  '41 4 * * *',
  $job$ select public.cleanup_stale_anonymous_users(); $job$
);

comment on function public.cleanup_stale_anonymous_users(interval) is
  'Deletes anonymous Auth users inactive beyond retention while preserving users in live rooms.';
