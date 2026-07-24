alter table public.chat_invitations
  add column manual_code_hash text
  constraint chat_invitations_manual_code_hash_valid
  check (
    manual_code_hash is null
    or manual_code_hash ~ '^[0-9a-f]{64}$'
  );

create unique index chat_invitations_manual_code_hash_unique
  on public.chat_invitations (manual_code_hash)
  where manual_code_hash is not null;

create function public.create_chat_invitation_internal(p_public_key text)
returns table (
  room_id uuid,
  invitation_token text,
  invitation_code text,
  invitation_expires_at timestamptz,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
  v_token text;
  v_code text;
  v_invitation_expires_at timestamptz := now() + interval '90 seconds';
  v_room_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform public.enforce_chat_rate_limit('create', 5, interval '10 minutes');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  if exists (
    select 1 from public.chat_active_memberships
    where user_id = v_user_id
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;

  insert into public.chat_rooms (expires_at)
  values (v_room_expires_at)
  returning id into v_room_id;

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room_id, v_user_id, 'creator', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room_id);

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.chat_invitations (
    room_id,
    token_hash,
    manual_code_hash,
    expires_at
  ) values (
    v_room_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(lower(v_code), 'sha256'), 'hex'),
    v_invitation_expires_at
  );

  return query select
    v_room_id,
    v_token,
    substring(v_code from 1 for 4) || '-' ||
      substring(v_code from 5 for 4) || '-' ||
      substring(v_code from 9 for 4) || '-' ||
      substring(v_code from 13 for 4),
    v_invitation_expires_at,
    v_room_expires_at;
end;
$$;

create function public.create_chat_invitation_v2(p_public_key text)
returns table (
  room_id uuid,
  invitation_token text,
  invitation_code text,
  invitation_expires_at timestamptz,
  room_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select *
  from public.create_chat_invitation_internal(p_public_key);
$$;

create or replace function public.create_chat_invitation(p_public_key text)
returns table (
  room_id uuid,
  invitation_token text,
  invitation_expires_at timestamptz,
  room_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    created.room_id,
    created.invitation_token,
    created.invitation_expires_at,
    created.room_expires_at
  from public.create_chat_invitation_internal(p_public_key) created;
$$;

create function public.join_chat_invitation_by_hash(
  p_invitation_hash text,
  p_public_key text
)
returns table (
  room_id uuid,
  peer_public_key text,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.chat_invitations%rowtype;
  v_room public.chat_rooms%rowtype;
  v_peer_public_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_hash is null
     or p_invitation_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_chat_invitation';
  end if;
  if p_public_key is null
     or length(p_public_key) <> 44
     or p_public_key !~ '^[A-Za-z0-9+/]{43}=$' then
    raise exception using errcode = '22023', message = 'invalid_chat_public_key';
  end if;

  perform public.enforce_chat_rate_limit('join', 10, interval '10 minutes');
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 421));

  select invitation.* into v_invitation
  from public.chat_invitations invitation
  where invitation.token_hash = p_invitation_hash
     or invitation.manual_code_hash = p_invitation_hash
  for update;

  if v_invitation.id is null
     or v_invitation.consumed_at is not null
     or v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'chat_invitation_unavailable';
  end if;

  select room.* into v_room
  from public.chat_rooms room
  where room.id = v_invitation.room_id
  for update;

  if v_room.status <> 'inviting' or v_room.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'chat_invitation_unavailable';
  end if;
  if exists (
    select 1 from public.chat_active_memberships
    where user_id = v_user_id
  ) then
    raise exception using errcode = '23505', message = 'active_chat_exists';
  end if;
  if exists (
    select 1 from public.chat_participants participant
    where participant.room_id = v_room.id
      and participant.user_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'creator_cannot_join_own_chat';
  end if;
  if (
    select count(*) from public.chat_participants participant
    where participant.room_id = v_room.id
  ) <> 1 then
    raise exception using errcode = 'P0001', message = 'chat_room_full';
  end if;

  select participant.public_key into v_peer_public_key
  from public.chat_participants participant
  where participant.room_id = v_room.id and participant.role = 'creator';

  insert into public.chat_participants (room_id, user_id, role, public_key)
  values (v_room.id, v_user_id, 'joiner', p_public_key);
  insert into public.chat_active_memberships (user_id, room_id)
  values (v_user_id, v_room.id);
  update public.chat_invitations
  set consumed_at = now()
  where id = v_invitation.id;
  update public.chat_rooms
  set status = 'active', activated_at = now()
  where id = v_room.id;

  return query select v_room.id, v_peer_public_key, v_room.expires_at;
end;
$$;

create or replace function public.join_chat_invitation(
  p_invitation_token text,
  p_public_key text
)
returns table (
  room_id uuid,
  peer_public_key text,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_invitation_token is null
     or p_invitation_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_chat_invitation';
  end if;
  return query
  select *
  from public.join_chat_invitation_by_hash(
    encode(extensions.digest(p_invitation_token, 'sha256'), 'hex'),
    p_public_key
  );
end;
$$;

create function public.join_chat_invitation_v2(
  p_invitation_secret text,
  p_invitation_method text,
  p_public_key text
)
returns table (
  room_id uuid,
  peer_public_key text,
  room_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_secret text;
begin
  if p_invitation_method = 'token' then
    if p_invitation_secret is null
       or p_invitation_secret !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'invalid_chat_invitation';
    end if;
    v_normalized_secret := p_invitation_secret;
  elsif p_invitation_method = 'code' then
    if p_invitation_secret is null
       or p_invitation_secret !~ '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$' then
      raise exception using errcode = '22023', message = 'invalid_chat_invitation_code';
    end if;
    v_normalized_secret := lower(replace(p_invitation_secret, '-', ''));
  else
    raise exception using errcode = '22023', message = 'invalid_chat_invitation_method';
  end if;

  return query
  select *
  from public.join_chat_invitation_by_hash(
    encode(extensions.digest(v_normalized_secret, 'sha256'), 'hex'),
    p_public_key
  );
end;
$$;

revoke all on function public.create_chat_invitation_internal(text) from public;
revoke all on function public.create_chat_invitation_v2(text) from public;
revoke all on function public.join_chat_invitation_by_hash(text, text) from public;
revoke all on function public.join_chat_invitation_v2(text, text, text) from public;

grant execute on function public.create_chat_invitation_v2(text) to authenticated;
grant execute on function public.join_chat_invitation_v2(text, text, text) to authenticated;

comment on column public.chat_invitations.manual_code_hash is
  'SHA-256 hash of the short-lived manual fallback code; plaintext is returned once.';
comment on function public.join_chat_invitation_v2(text, text, text) is
  'Redeems the same one-use invitation by high-entropy link token or rate-limited manual code.';
