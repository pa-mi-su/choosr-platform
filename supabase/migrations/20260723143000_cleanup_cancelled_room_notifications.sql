-- Keep room lifecycle, notification inbox, and pending push delivery in sync.

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
  set status = 'cancelled', responded_at = coalesce(responded_at, now())
  where session_id = p_session_id
    and status = 'pending';

  update public.user_notifications
  set deleted_at = coalesce(deleted_at, now()),
      read_at = coalesce(read_at, now())
  where kind = 'room_invitation'
    and payload->>'session_id' = p_session_id::text
    and deleted_at is null;

  delete from public.notification_outbox
  where kind = 'room_invitation'
    and payload->>'session_id' = p_session_id::text
    and delivered_at is null;
end;
$$;

revoke all on function public.cancel_session(uuid) from public;
grant execute on function public.cancel_session(uuid) to authenticated;

-- Reconcile invitations cancelled or expired before this migration existed.
update public.user_notifications notification
set deleted_at = coalesce(notification.deleted_at, now()),
    read_at = coalesce(notification.read_at, now())
where notification.kind = 'room_invitation'
  and notification.deleted_at is null
  and not exists (
    select 1
    from public.room_invitations invitation
    join public.sessions room on room.id = invitation.session_id
    where invitation.id::text = notification.payload->>'invitation_id'
      and invitation.recipient_user_id = notification.recipient_user_id
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and room.status in ('waiting', 'active')
      and room.expires_at > now()
  );

delete from public.notification_outbox outbox
where outbox.kind = 'room_invitation'
  and outbox.delivered_at is null
  and not exists (
    select 1
    from public.room_invitations invitation
    join public.sessions room on room.id = invitation.session_id
    where invitation.id::text = outbox.payload->>'invitation_id'
      and invitation.recipient_user_id = outbox.recipient_user_id
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and room.status in ('waiting', 'active')
      and room.expires_at > now()
  );
