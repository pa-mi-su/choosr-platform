-- A completed room remains useful history for 24 hours after the result was
-- produced. This timestamp is independent of the room's original join expiry
-- and of either participant acknowledging the result.

alter table public.sessions
  add column completed_at timestamptz;

update public.sessions
set completed_at = coalesce(matched_at, now())
where status in ('matched', 'completed');

create function private.stamp_session_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('matched', 'completed')
     and (
       tg_op = 'INSERT'
       or old.status not in ('matched', 'completed')
       or new.round_number is distinct from old.round_number
     ) then
    new.completed_at := now();
  elsif new.status not in ('matched', 'completed') then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_session_completion() from public;

create trigger sessions_stamp_completion
before insert or update of status, round_number on public.sessions
for each row execute function private.stamp_session_completion();

create or replace function public.list_active_room_history()
returns table (
  session_id uuid,
  access_code text,
  mode text,
  status text,
  round_number integer,
  expires_at timestamptz,
  created_at timestamptz,
  participant_count bigint,
  total_choices bigint,
  completed_choices bigint,
  matched_item_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    session.id,
    session.access_code,
    session.mode,
    session.status,
    session.round_number,
    case
      when session.status in ('matched', 'completed')
        then session.completed_at + interval '24 hours'
      else session.expires_at
    end,
    session.created_at,
    (
      select count(*)
      from public.participants participant
      where participant.session_id = session.id
    ),
    (
      select count(*)
      from public.session_items item
      where item.session_id = session.id
        and item.round = session.round_number
    ),
    (
      select count(*)
      from public.swipes swipe
      where swipe.session_id = session.id
        and swipe.round = session.round_number
        and swipe.participant_id =
          public.participant_id_for_user(session.id, (select auth.uid()))
    ),
    (
      select match.item_id
      from public.matches match
      where match.session_id = session.id
        and match.round = session.round_number
      limit 1
    )
  from public.sessions session
  where (select auth.uid()) is not null
    and session.status in ('waiting', 'active', 'matched', 'completed')
    and (
      (
        session.status in ('waiting', 'active')
        and session.expires_at > now()
      )
      or (
        session.status in ('matched', 'completed')
        and session.completed_at > now() - interval '24 hours'
      )
    )
    and exists (
      select 1
      from public.participants own_participant
      where own_participant.session_id = session.id
        and own_participant.auth_user_id = (select auth.uid())
    )
  order by coalesce(session.completed_at, session.created_at) desc
  limit 50;
$$;

revoke all on function public.list_active_room_history() from public;
grant execute on function public.list_active_room_history() to authenticated;

create or replace function public.cleanup_expired_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  update public.sessions
  set status = 'expired'
  where status in ('waiting', 'active')
    and expires_at <= now();

  update public.sessions
  set status = 'expired'
  where status in ('matched', 'completed')
    and completed_at <= now() - interval '24 hours';

  delete from public.sessions
  where status in ('expired', 'cancelled')
    and coalesce(completed_at + interval '24 hours', expires_at)
      <= now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_sessions() from public;

-- A pending invitation is only real while both its invitation and its room are
-- live. Reconcile stale rows before returning anything to a client.

create or replace function public.list_pending_room_invitations()
returns table (
  invitation_id uuid,
  session_id uuid,
  sender_display_name text,
  sender_handle text,
  mode text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_invitations invitation
  set status = case
        when invitation.expires_at <= now() or room.expires_at <= now()
          then 'expired'
        else 'cancelled'
      end,
      responded_at = coalesce(invitation.responded_at, now())
  from public.sessions room
  where invitation.session_id = room.id
    and invitation.recipient_user_id = (select auth.uid())
    and invitation.status = 'pending'
    and (
      invitation.expires_at <= now()
      or room.expires_at <= now()
      or room.status <> 'waiting'
    );

  return query
  select
    invitation.id,
    invitation.session_id,
    profile.display_name,
    profile.handle,
    room.mode,
    invitation.expires_at
  from public.room_invitations invitation
  join public.profiles profile on profile.user_id = invitation.sender_user_id
  join public.sessions room on room.id = invitation.session_id
  where invitation.recipient_user_id = (select auth.uid())
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and room.status = 'waiting'
    and room.expires_at > now()
  order by invitation.created_at desc;
end;
$$;

revoke all on function public.list_pending_room_invitations() from public;
grant execute on function public.list_pending_room_invitations()
  to authenticated;

-- Resolve the in-app event and any unsent provider job whenever the underlying
-- invitation/request is no longer actionable.

create function private.close_room_invitation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    update public.user_notifications notification
    set deleted_at = coalesce(notification.deleted_at, now()),
        read_at = coalesce(notification.read_at, now())
    where notification.kind = 'room_invitation'
      and notification.payload->>'invitation_id' = new.id::text
      and notification.deleted_at is null;

    update public.notification_outbox job
    set discarded_at = coalesce(job.discarded_at, now()),
        discard_reason = coalesce(job.discard_reason, 'invitation_resolved'),
        processing_started_at = null
    where job.kind = 'room_invitation'
      and job.payload->>'invitation_id' = new.id::text
      and job.delivered_at is null
      and job.discarded_at is null;
  end if;
  return new;
end;
$$;

create function private.close_connection_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    update public.user_notifications notification
    set deleted_at = coalesce(notification.deleted_at, now()),
        read_at = coalesce(notification.read_at, now())
    where notification.kind = 'connection_request'
      and notification.payload->>'connection_id' = new.id::text
      and notification.deleted_at is null;

    update public.notification_outbox job
    set discarded_at = coalesce(job.discarded_at, now()),
        discard_reason = coalesce(job.discard_reason, 'connection_resolved'),
        processing_started_at = null
    where job.kind = 'connection_request'
      and job.payload->>'connection_id' = new.id::text
      and job.delivered_at is null
      and job.discarded_at is null;
  end if;
  return new;
end;
$$;

create function private.close_room_invitations_with_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'expired')
     and old.status is distinct from new.status then
    update public.room_invitations invitation
    set status = case when new.status = 'expired' then 'expired' else 'cancelled' end,
        responded_at = coalesce(invitation.responded_at, now())
    where invitation.session_id = new.id
      and invitation.status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function private.close_room_invitation_notification() from public;
revoke all on function private.close_connection_notification() from public;
revoke all on function private.close_room_invitations_with_session() from public;

-- Columns are added before the cleanup triggers because those triggers retain
-- an explicit audit reason instead of silently deleting failed/stale jobs.
alter table public.notification_outbox
  add column deliver_before timestamptz,
  add column discarded_at timestamptz,
  add column discard_reason text;

update public.notification_outbox
set deliver_before = created_at + interval '5 minutes';

alter table public.notification_outbox
  alter column deliver_before set default (now() + interval '5 minutes'),
  alter column deliver_before set not null,
  add constraint notification_outbox_delivery_window_valid
    check (deliver_before > created_at),
  add constraint notification_outbox_terminal_state_valid
    check (delivered_at is null or discarded_at is null),
  add constraint notification_outbox_discard_reason_safe
    check (
      discard_reason is null
      or discard_reason ~ '^[a-z0-9_.-]{1,80}$'
    );

drop index if exists public.notification_outbox_pending_idx;
create index notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where delivered_at is null and discarded_at is null;

create trigger room_invitation_notification_cleanup
after update of status on public.room_invitations
for each row execute function private.close_room_invitation_notification();

create trigger connection_notification_cleanup
after update of status on public.connections
for each row execute function private.close_connection_notification();

create trigger session_invitation_cleanup
after update of status on public.sessions
for each row execute function private.close_room_invitations_with_session();

create function private.notification_job_is_current(
  p_kind text,
  p_payload jsonb,
  p_dedupe_key text,
  p_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'room_invitation' then exists (
      select 1
      from public.room_invitations invitation
      join public.sessions room on room.id = invitation.session_id
      where invitation.id::text = p_payload->>'invitation_id'
        and invitation.recipient_user_id = p_recipient_user_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
        and room.status = 'waiting'
        and room.expires_at > now()
    )
    when 'connection_request' then exists (
      select 1
      from public.connections connection
      where connection.id::text = p_payload->>'connection_id'
        and connection.addressee_user_id = p_recipient_user_id
        and connection.status = 'pending'
    )
    when 'chat_message' then exists (
      select 1
      from public.chat_messages message
      join public.chat_rooms room on room.id = message.room_id
      join public.chat_participants participant
        on participant.room_id = room.id
       and participant.user_id = p_recipient_user_id
      where p_dedupe_key = 'chat-message:' || message.id::text
        and room.status = 'active'
        and room.expires_at > now()
    )
    else false
  end;
$$;

revoke all on function private.notification_job_is_current(
  text, jsonb, text, uuid
) from public;

-- Reconcile anything already queued before the validity and delivery-window
-- rules existed. These jobs can remain visible in the inbox when still useful,
-- but they can never produce a delayed provider alert.
update public.notification_outbox job
set discarded_at = now(),
    discard_reason = case
      when job.deliver_before <= now() then 'delivery_window_expired'
      else 'event_no_longer_current'
    end,
    processing_started_at = null
where job.delivered_at is null
  and job.discarded_at is null
  and (
    job.deliver_before <= now()
    or not private.notification_job_is_current(
      job.kind,
      job.payload,
      job.dedupe_key,
      job.recipient_user_id
    )
  );

drop function public.claim_notification_jobs(integer);

create function public.claim_notification_jobs(p_limit integer default 25)
returns table (
  id bigint,
  recipient_user_id uuid,
  kind text,
  payload jsonb,
  attempts integer,
  dedupe_key text,
  deliver_before timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox job
  set discarded_at = now(),
      discard_reason = case
        when job.deliver_before <= now() then 'delivery_window_expired'
        when job.attempts >= 5 then 'retry_limit_reached'
        else 'event_no_longer_current'
      end,
      processing_started_at = null
  where job.delivered_at is null
    and job.discarded_at is null
    and (
      job.deliver_before <= now()
      or job.attempts >= 5
      or not private.notification_job_is_current(
        job.kind,
        job.payload,
        job.dedupe_key,
        job.recipient_user_id
      )
    );

  return query
  with pending as (
    select job.id
    from public.notification_outbox job
    where job.delivered_at is null
      and job.discarded_at is null
      and job.deliver_before > now()
      and job.attempts < 5
      and (
        job.processing_started_at is null
        or job.processing_started_at < now() - interval '5 minutes'
      )
      and private.notification_job_is_current(
        job.kind,
        job.payload,
        job.dedupe_key,
        job.recipient_user_id
      )
    order by job.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.notification_outbox job
  set processing_started_at = now(),
      attempts = job.attempts + 1,
      last_error = null
  from pending
  where job.id = pending.id
  returning
    job.id,
    job.recipient_user_id,
    job.kind,
    job.payload,
    job.attempts,
    job.dedupe_key,
    job.deliver_before;
end;
$$;

revoke all on function public.claim_notification_jobs(integer) from public;
grant execute on function public.claim_notification_jobs(integer)
  to service_role;

create function public.notification_job_is_deliverable(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notification_outbox job
    where job.id = p_id
      and job.delivered_at is null
      and job.discarded_at is null
      and job.deliver_before > now()
      and job.attempts <= 5
      and private.notification_job_is_current(
        job.kind,
        job.payload,
        job.dedupe_key,
        job.recipient_user_id
      )
  );
$$;

create function public.discard_notification_job(
  p_id bigint,
  p_reason text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set discarded_at = coalesce(discarded_at, now()),
      discard_reason = coalesce(
        discard_reason,
        case
          when coalesce(p_reason, '') ~ '^[a-z0-9_.-]{1,80}$'
            then p_reason
          else 'worker_discarded'
        end
      ),
      processing_started_at = null
  where id = p_id
    and delivered_at is null;
$$;

revoke all on function public.notification_job_is_deliverable(bigint)
  from public;
revoke all on function public.discard_notification_job(bigint, text)
  from public;
grant execute on function public.notification_job_is_deliverable(bigint)
  to service_role;
grant execute on function public.discard_notification_job(bigint, text)
  to service_role;

create or replace function public.complete_notification_job(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
  set delivered_at = now(),
      processing_started_at = null,
      last_error = null
  where id = p_id
    and delivered_at is null
    and discarded_at is null;
$$;

create or replace function public.fail_notification_job(
  p_id bigint,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
  set processing_started_at = null,
      last_error = left(coalesce(p_error, 'Push delivery failed.'), 500),
      discarded_at = case
        when attempts >= 5 or deliver_before <= now() then now()
        else discarded_at
      end,
      discard_reason = case
        when attempts >= 5 then 'retry_limit_reached'
        when deliver_before <= now() then 'delivery_window_expired'
        else discard_reason
      end
  where id = p_id
    and delivered_at is null
    and discarded_at is null;
end;
$$;

-- Keep cancellation idempotent while retaining an auditable discarded job
-- instead of deleting it before operators can determine why it never sent.
create or replace function public.cancel_session(p_session_id uuid)
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

  if not exists (
    select 1
    from public.participants participant
    where participant.session_id = p_session_id
      and participant.auth_user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;

  update public.sessions
  set status = 'cancelled'
  where id = p_session_id
    and status in ('waiting', 'active', 'matched', 'completed');

  if not found and not exists (
    select 1
    from public.sessions room
    where room.id = p_session_id
      and room.status in ('cancelled', 'expired')
  ) then
    raise exception using errcode = 'P0001', message = 'session_cannot_be_cancelled';
  end if;

  update public.room_invitations
  set status = 'cancelled',
      responded_at = coalesce(responded_at, now())
  where session_id = p_session_id
    and status = 'pending';
end;
$$;

revoke all on function public.cancel_session(uuid) from public;
grant execute on function public.cancel_session(uuid) to authenticated;

comment on column public.sessions.completed_at is
  'Start of the participant-visible 24-hour completed-room history window.';
comment on column public.notification_outbox.deliver_before is
  'Hard provider-delivery deadline; the in-app event can remain visible after this time.';
comment on column public.notification_outbox.discarded_at is
  'Set when a job becomes stale, invalid, or exceeds the bounded retry policy.';
comment on function public.notification_job_is_deliverable(bigint) is
  'Revalidates event state immediately before external provider delivery.';
