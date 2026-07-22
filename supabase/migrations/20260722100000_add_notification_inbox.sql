create table public.user_notifications (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null constraint user_notifications_kind_valid
    check (kind in ('connection_request', 'room_invitation')),
  title text not null constraint user_notifications_title_present
    check (length(btrim(title)) between 1 and 120),
  body text not null constraint user_notifications_body_present
    check (length(btrim(body)) between 1 and 500),
  payload jsonb not null default '{}'::jsonb
    constraint user_notifications_payload_object
    check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index user_notifications_recipient_idx
  on public.user_notifications (recipient_user_id, created_at desc);
create index user_notifications_unread_idx
  on public.user_notifications (recipient_user_id, created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;

create policy user_notifications_select_own
  on public.user_notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create function public.archive_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := new.payload->>'mode';
begin
  insert into public.user_notifications (
    recipient_user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  ) values (
    new.recipient_user_id,
    new.kind,
    case new.kind
      when 'connection_request' then 'New Choosr connection'
      else 'You''re invited'
    end,
    case new.kind
      when 'connection_request' then 'Someone wants to add you to their Circle.'
      when 'room_invitation' then
        case v_mode
          when 'eat' then 'Open Choosr to pick food together.'
          when 'do' then 'Open Choosr to pick an activity together.'
          else 'Open Choosr to choose together.'
        end
    end,
    new.payload,
    new.dedupe_key
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger notification_outbox_archive_event
after insert on public.notification_outbox
for each row execute function public.archive_notification_event();

create function public.mark_notifications_read(p_notification_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.user_notifications
  set read_at = now()
  where recipient_user_id = (select auth.uid())
    and read_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.user_notifications
  where recipient_user_id = (select auth.uid())
    and read_at is null;
$$;

revoke all on function public.mark_notifications_read(bigint[]) from public;
revoke all on function public.unread_notification_count() from public;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;

grant select on public.user_notifications to service_role;

comment on table public.user_notifications is
  'Recipient-visible notification history. Push delivery remains isolated in notification_outbox.';

create or replace function public.cleanup_circle_artifacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_rows integer;
begin
  delete from public.circle_invites
  where expires_at < now() - interval '7 days'
     or redeemed_at < now() - interval '7 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from public.notification_outbox
  where delivered_at < now() - interval '7 days'
     or created_at < now() - interval '30 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;

  delete from public.user_notifications
  where created_at < now() - interval '30 days';
  get diagnostics v_rows = row_count;
  v_deleted := v_deleted + v_rows;
  return v_deleted;
end;
$$;
