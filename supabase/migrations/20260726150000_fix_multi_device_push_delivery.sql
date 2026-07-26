-- A Choosr identity can legitimately be active on more than one iOS or
-- Android device. Token rotation is scoped by the token itself: FCM reports
-- superseded tokens as invalid and the dispatcher removes them. Deleting every
-- other token for the same platform makes two iPhones evict each other, so the
-- device opened most recently becomes the only one that can receive pushes.

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

comment on function public.register_push_token(text, text) is
  'Registers one device endpoint without evicting other devices owned by the same identity.';

-- Start delivery as soon as an outbox row commits. The existing once-per-minute
-- cron worker remains the durable retry path if this best-effort request or FCM
-- is temporarily unavailable.

create or replace function private.dispatch_notification_outbox_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dispatch_pending_notifications();
  return new;
end;
$$;

revoke all on function private.dispatch_notification_outbox_insert() from public;

create trigger notification_outbox_dispatch_insert
after insert on public.notification_outbox
for each statement execute function private.dispatch_notification_outbox_insert();

comment on function private.dispatch_notification_outbox_insert() is
  'Starts push dispatch after new notification jobs commit; scheduled dispatch remains the retry fallback.';
