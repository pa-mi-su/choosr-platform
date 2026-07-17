create or replace function public.respond_room_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns table (
  session_id uuid,
  status text,
  round_number integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.room_invitations%rowtype;
  v_session public.sessions%rowtype;
begin
  select ri.* into v_invitation
  from public.room_invitations ri
  where ri.id = p_invitation_id
    and ri.recipient_user_id = v_user_id
  for update;

  if not found or v_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  if not p_accept then
    update public.room_invitations
    set status = 'declined', responded_at = now()
    where id = p_invitation_id;
    return;
  end if;

  select s.* into v_session
  from public.sessions s
  where s.id = v_invitation.session_id
  for update;

  if v_invitation.expires_at <= now() or v_session.expires_at <= now() then
    update public.room_invitations set status = 'expired' where id = p_invitation_id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;
  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_unavailable';
  end if;
  if (
    select count(*)
    from public.participants participant
    where participant.session_id = v_session.id
  ) >= 2 then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner')
  on conflict on constraint participants_session_id_auth_user_id_key do nothing;

  update public.sessions set status = 'active' where id = v_session.id;
  update public.room_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  return query
    select v_session.id, 'active'::text, v_session.round_number, v_session.expires_at;
end;
$$;
