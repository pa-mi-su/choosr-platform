-- Matched-room chats need a durable invitation for the participant who did
-- not initiate the chat. The invitation is derived from the authoritative
-- chat-room state, so it cannot drift from the encrypted chat lifecycle.

alter table public.notification_outbox
  drop constraint notification_outbox_kind_valid,
  add constraint notification_outbox_kind_valid
  check (
    kind in (
      'connection_request',
      'room_invitation',
      'chat_invitation',
      'chat_message'
    )
  );

alter table public.user_notifications
  drop constraint user_notifications_kind_valid,
  add constraint user_notifications_kind_valid
  check (
    kind in (
      'connection_request',
      'room_invitation',
      'chat_invitation',
      'chat_message'
    )
  );

create or replace function public.archive_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := new.payload->>'mode';
  v_sender_name text := nullif(
    regexp_replace(
      btrim(new.payload->>'sender_display_name'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
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
      when 'chat_invitation' then 'Private chat invitation'
      when 'chat_message' then 'New private Choosr message'
      else 'You''re invited'
    end,
    case new.kind
      when 'connection_request' then
        'Someone wants to add you to their Circle.'
      when 'chat_invitation' then
        coalesce(v_sender_name, 'Your Choosr partner')
          || ' wants to start a private chat about your match.'
      when 'chat_message' then
        'Open Choosr to view it privately.'
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

create or replace function private.notification_job_is_current(
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
    when 'chat_invitation' then exists (
      select 1
      from public.chat_rooms room
      join public.participants recipient
        on recipient.session_id = room.decision_session_id
       and recipient.auth_user_id = p_recipient_user_id
      where room.id::text = p_payload->>'chat_room_id'
        and room.status = 'inviting'
        and room.expires_at > now()
        and not exists (
          select 1
          from public.chat_participants joined
          where joined.room_id = room.id
            and joined.user_id = p_recipient_user_id
        )
        and (
          select count(*)
          from public.chat_participants participant
          where participant.room_id = room.id
        ) = 1
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

create function private.close_matched_chat_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'inviting' and new.status <> 'inviting' then
    update public.user_notifications notification
    set deleted_at = coalesce(notification.deleted_at, now()),
        read_at = coalesce(notification.read_at, now())
    where notification.kind = 'chat_invitation'
      and notification.payload->>'chat_room_id' = new.id::text
      and notification.deleted_at is null;

    update public.notification_outbox job
    set discarded_at = coalesce(job.discarded_at, now()),
        discard_reason = coalesce(
          job.discard_reason,
          'chat_invitation_closed'
        )
    where job.kind = 'chat_invitation'
      and job.payload->>'chat_room_id' = new.id::text
      and job.delivered_at is null
      and job.discarded_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.close_matched_chat_invitation() from public;

create trigger matched_chat_invitation_cleanup
after update of status on public.chat_rooms
for each row execute function private.close_matched_chat_invitation();

create or replace function public.open_matched_room_chat(
  p_session_id uuid,
  p_public_key text
)
returns table (
  room_id uuid,
  status text,
  role text,
  own_public_key text,
  peer_public_key text,
  room_expires_at timestamptz,
  decision_session_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_decision_session public.sessions%rowtype;
  v_room public.chat_rooms%rowtype;
  v_role text;
  v_peer_public_key text;
  v_recipient_user_id uuid;
  v_sender_display_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 827));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  select session.* into v_decision_session
  from public.sessions session
  where session.id = p_session_id
  for update;

  if v_decision_session.id is null
     or v_decision_session.status <> 'matched'
     or v_decision_session.completed_at is null
     or v_decision_session.completed_at <= now() - interval '24 hours'
     or not exists (
       select 1
       from public.participants participant
       where participant.session_id = p_session_id
         and participant.auth_user_id = v_user_id
     ) then
    raise exception using errcode = '42501', message = 'matched_room_chat_unavailable';
  end if;

  select room.* into v_room
  from public.chat_rooms room
  where room.decision_session_id = p_session_id
    and room.status in ('inviting', 'active')
    and room.expires_at > now()
  for update;

  if exists (
    select 1
    from public.chat_active_memberships membership
    where membership.user_id = v_user_id
      and (v_room.id is null or membership.room_id <> v_room.id)
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;

  if v_room.id is null then
    select participant.auth_user_id into v_recipient_user_id
    from public.participants participant
    where participant.session_id = p_session_id
      and participant.auth_user_id <> v_user_id
    order by participant.joined_at
    limit 1;

    if v_recipient_user_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'matched_room_chat_unavailable';
    end if;

    perform public.enforce_chat_rate_limit('create', 5, interval '10 minutes');

    insert into public.chat_rooms (decision_session_id, expires_at)
    values (
      p_session_id,
      least(
        now() + interval '24 hours',
        v_decision_session.completed_at + interval '24 hours'
      )
    )
    returning * into v_room;

    insert into public.chat_participants (room_id, user_id, role, public_key)
    values (v_room.id, v_user_id, 'creator', p_public_key);
    insert into public.chat_active_memberships (user_id, room_id)
    values (v_user_id, v_room.id);

    select regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g')
    into v_sender_display_name
    from public.profiles profile
    where profile.user_id = v_user_id;

    insert into public.notification_outbox (
      recipient_user_id,
      kind,
      payload,
      dedupe_key
    ) values (
      v_recipient_user_id,
      'chat_invitation',
      jsonb_build_object(
        'chat_room_id', v_room.id,
        'session_id', p_session_id,
        'sender_user_id', v_user_id,
        'sender_display_name',
          coalesce(v_sender_display_name, 'Your Choosr partner')
      ),
      'matched-chat-invitation:' || v_room.id::text
    ) on conflict (dedupe_key) do nothing;

    return query select
      v_room.id,
      'inviting'::text,
      'creator'::text,
      p_public_key,
      null::text,
      v_room.expires_at,
      p_session_id;
    return;
  end if;

  select participant.role into v_role
  from public.chat_participants participant
  where participant.room_id = v_room.id
    and participant.user_id = v_user_id;

  if v_role is not null then
    select peer.public_key into v_peer_public_key
    from public.chat_participants peer
    where peer.room_id = v_room.id
      and peer.user_id <> v_user_id
    limit 1;

    return query select
      v_room.id,
      v_room.status,
      v_role,
      p_public_key,
      v_peer_public_key,
      v_room.expires_at,
      p_session_id;
    return;
  end if;

  if v_room.status <> 'inviting'
     or (
       select count(*)
       from public.chat_participants participant
       where participant.room_id = v_room.id
     ) <> 1 then
    raise exception using errcode = 'P0001', message = 'matched_room_chat_unavailable';
  end if;

  perform public.enforce_chat_rate_limit('join', 10, interval '10 minutes');

  select creator.public_key into v_peer_public_key
  from public.chat_participants creator
  where creator.room_id = v_room.id
    and creator.role = 'creator';

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room.id, v_user_id, 'joiner', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room.id);
  update public.chat_rooms
  set status = 'active',
      activated_at = now()
  where id = v_room.id
  returning * into v_room;

  return query select
    v_room.id,
    'active'::text,
    'joiner'::text,
    p_public_key,
    v_peer_public_key,
    v_room.expires_at,
    p_session_id;
end;
$$;

create function public.list_pending_matched_chat_invitations()
returns table (
  chat_room_id uuid,
  decision_session_id uuid,
  inviter_display_name text,
  inviter_avatar_path text,
  matched_item_title text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    room.id,
    room.decision_session_id,
    coalesce(inviter_profile.display_name, 'Your Choosr partner'),
    inviter_profile.avatar_path,
    coalesce(item.item_payload->>'title', 'your match'),
    room.created_at,
    room.expires_at
  from public.chat_rooms room
  join public.sessions decision_session
    on decision_session.id = room.decision_session_id
  join public.chat_participants inviter
    on inviter.room_id = room.id
   and inviter.role = 'creator'
  left join public.profiles inviter_profile
    on inviter_profile.user_id = inviter.user_id
  left join public.matches match
    on match.session_id = room.decision_session_id
   and match.round = decision_session.round_number
  left join public.session_items item
    on item.session_id = match.session_id
   and item.round = match.round
   and item.item_id = match.item_id
  where (select auth.uid()) is not null
    and room.status = 'inviting'
    and room.expires_at > now()
    and inviter.user_id <> (select auth.uid())
    and exists (
      select 1
      from public.participants recipient
      where recipient.session_id = room.decision_session_id
        and recipient.auth_user_id = (select auth.uid())
    )
    and not exists (
      select 1
      from public.chat_participants joined
      where joined.room_id = room.id
        and joined.user_id = (select auth.uid())
    )
  order by room.created_at desc
  limit 20;
$$;

create function public.decline_matched_chat_invitation(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.chat_rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text, 613));

  select room.* into v_room
  from public.chat_rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null
     or v_room.status <> 'inviting'
     or v_room.expires_at <= now()
     or v_room.decision_session_id is null
     or not exists (
       select 1
       from public.participants recipient
       where recipient.session_id = v_room.decision_session_id
         and recipient.auth_user_id = v_user_id
     )
     or exists (
       select 1
       from public.chat_participants participant
       where participant.room_id = v_room.id
         and participant.user_id = v_user_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'matched_room_chat_unavailable';
  end if;

  perform public.destroy_chat_room_internal(v_room.id, 'participant');
end;
$$;

revoke all on function public.list_pending_matched_chat_invitations()
  from public;
revoke all on function public.decline_matched_chat_invitation(uuid)
  from public;
grant execute on function public.list_pending_matched_chat_invitations()
  to authenticated;
grant execute on function public.decline_matched_chat_invitation(uuid)
  to authenticated;

comment on function public.list_pending_matched_chat_invitations() is
  'Lists authoritative matched-room chat invitations awaiting the current participant.';
comment on function public.decline_matched_chat_invitation(uuid) is
  'Declines and destroys a waiting matched-room chat on behalf of its invited participant.';
