-- A private chat invitation is the only alert for a chat lifecycle. Individual
-- encrypted messages remain available through Realtime and polling while the
-- chat is open, but never create inbox rows or provider push jobs.

delete from public.notification_outbox
where kind = 'chat_message';

delete from public.user_notifications
where kind = 'chat_message';

alter table public.notification_outbox
  drop constraint notification_outbox_kind_valid,
  add constraint notification_outbox_kind_valid
  check (
    kind in (
      'connection_request',
      'room_invitation',
      'chat_invitation'
    )
  );

alter table public.user_notifications
  drop constraint user_notifications_kind_valid,
  add constraint user_notifications_kind_valid
  check (
    kind in (
      'connection_request',
      'room_invitation',
      'chat_invitation'
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
      else 'You''re invited'
    end,
    case new.kind
      when 'connection_request' then
        'Someone wants to add you to their Circle.'
      when 'chat_invitation' then
        coalesce(v_sender_name, 'Your Choosr partner')
          || ' wants to start a private chat about your match.'
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
    else false
  end;
$$;

create or replace function public.send_chat_ciphertext(
  p_room_id uuid,
  p_client_message_id uuid,
  p_nonce text,
  p_ciphertext text
)
returns table (
  message_id bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.chat_rooms%rowtype;
  v_message_id bigint;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_client_message_id is null
     or p_nonce is null
     or length(p_nonce) <> 32
     or p_nonce !~ '^[A-Za-z0-9+/]{32}$'
     or p_ciphertext is null
     or length(p_ciphertext) not between 24 and 16384
     or p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception using errcode = '22023', message = 'invalid_chat_ciphertext';
  end if;

  perform public.enforce_chat_rate_limit('message', 60, interval '1 minute');
  select room.* into v_room
  from public.chat_rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null
     or v_room.status <> 'active'
     or v_room.expires_at <= now()
     or not exists (
       select 1
       from public.chat_participants participant
       where participant.room_id = p_room_id
         and participant.user_id = v_user_id
     )
     or (
       select count(*)
       from public.chat_participants participant
       where participant.room_id = p_room_id
     ) <> 2 then
    raise exception using errcode = '42501', message = 'chat_not_available';
  end if;

  insert into public.chat_messages (
    room_id,
    sender_user_id,
    client_message_id,
    nonce,
    ciphertext
  ) values (
    p_room_id,
    v_user_id,
    p_client_message_id,
    p_nonce,
    p_ciphertext
  )
  on conflict (room_id, sender_user_id, client_message_id)
  do update set client_message_id = excluded.client_message_id
  returning id, chat_messages.created_at into v_message_id, v_created_at;

  return query select v_message_id, v_created_at;
end;
$$;

comment on function public.send_chat_ciphertext(uuid, uuid, text, text) is
  'Stores an authenticated ciphertext envelope without creating per-message notifications.';
