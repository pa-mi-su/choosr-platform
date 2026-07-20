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
end;
$$;

revoke all on function public.cancel_session(uuid) from public;
grant execute on function public.cancel_session(uuid) to authenticated;
