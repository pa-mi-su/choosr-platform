-- Identifier-bearing RPCs must commit their attempt counters even when the
-- supplied handle, token, or room code is unavailable. Returning no row/null
-- for unavailable identifiers also avoids exposing which validation failed.

create or replace function public.upsert_choosr_profile(
  p_display_name text,
  p_handle text
)
returns table (user_id uuid, display_name text, handle text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_display_name text := btrim(p_display_name);
  v_handle text := lower(btrim(p_handle));
begin
  perform private.assert_account_active(v_user_id);
  if not private.consume_rate_limit(
    v_user_id::text, 'handle_claim_attempt', 20, 86400
  ) then
    return;
  end if;
  if length(v_display_name) not between 1 and 40
     or v_handle !~ '^[a-z0-9_]{3,24}$' then
    return;
  end if;

  begin
    insert into public.profiles (user_id, display_name, handle)
    values (v_user_id, v_display_name, v_handle)
    on conflict on constraint profiles_pkey do update
    set display_name = excluded.display_name,
        handle = excluded.handle,
        updated_at = now();
  exception when unique_violation then
    return;
  end;
  return query select v_user_id, v_display_name, v_handle;
end;
$$;

create or replace function public.send_connection_request(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recipient_id uuid;
  v_connection public.connections%rowtype;
  v_connection_id uuid;
  v_dedupe_key text;
begin
  perform private.assert_account_active(v_user_id);
  if not private.consume_rate_limit(
    v_user_id::text, 'handle_lookup_attempt', 30, 3600
  ) then
    return null;
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    return null;
  end if;

  select profile.user_id into v_recipient_id
  from public.profiles profile
  where profile.handle = lower(btrim(p_handle));
  if v_recipient_id is null or v_recipient_id = v_user_id then
    return null;
  end if;

  begin
    select connection.* into v_connection
    from public.connections connection
    where least(
      connection.requester_user_id,
      connection.addressee_user_id
    ) = least(v_user_id, v_recipient_id)
      and greatest(
        connection.requester_user_id,
        connection.addressee_user_id
      ) = greatest(v_user_id, v_recipient_id)
    for update;

    if found then
      if v_connection.status not in ('removed', 'declined') then
        return null;
      end if;
      update public.connections
      set requester_user_id = v_user_id,
          addressee_user_id = v_recipient_id,
          status = 'pending',
          created_at = now(),
          responded_at = null,
          removed_at = null
      where id = v_connection.id
      returning id into v_connection_id;
      v_dedupe_key := 'connection:' || v_connection_id::text || ':' ||
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    else
      insert into public.connections (requester_user_id, addressee_user_id)
      values (v_user_id, v_recipient_id)
      returning id into v_connection_id;
      v_dedupe_key := 'connection:' || v_connection_id::text;
    end if;
  exception when unique_violation then
    return null;
  end;

  insert into public.notification_outbox (
    recipient_user_id, kind, payload, dedupe_key
  ) values (
    v_recipient_id,
    'connection_request',
    jsonb_build_object(
      'connection_id', v_connection_id,
      'sender_user_id', v_user_id
    ),
    v_dedupe_key
  );
  return v_connection_id;
end;
$$;

create or replace function public.redeem_circle_invite(p_invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invite public.circle_invites%rowtype;
  v_connection_id uuid;
begin
  perform private.assert_account_active(v_user_id);
  if not private.consume_rate_limit(
    v_user_id::text, 'circle_invite_redeem_attempt', 20, 3600
  ) then
    return null;
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    return null;
  end if;

  select invite.* into v_invite
  from public.circle_invites invite
  where invite.token_hash = encode(
    extensions.digest(btrim(p_invite_token), 'sha256'),
    'hex'
  )
  for update;

  if not found
     or v_invite.expires_at <= now()
     or v_invite.redeemed_at is not null
     or v_invite.sender_user_id = v_user_id then
    return null;
  end if;

  select connection.id into v_connection_id
  from public.connections connection
  where least(
    connection.requester_user_id,
    connection.addressee_user_id
  ) = least(v_invite.sender_user_id, v_user_id)
    and greatest(
      connection.requester_user_id,
      connection.addressee_user_id
    ) = greatest(v_invite.sender_user_id, v_user_id)
  for update;

  if v_connection_id is null then
    insert into public.connections (
      requester_user_id,
      addressee_user_id,
      status,
      responded_at
    ) values (
      v_invite.sender_user_id,
      v_user_id,
      'accepted',
      now()
    ) returning id into v_connection_id;
  else
    update public.connections
    set status = 'accepted', responded_at = now()
    where id = v_connection_id;
  end if;

  update public.circle_invites
  set redeemed_by_user_id = v_user_id, redeemed_at = now()
  where id = v_invite.id;
  return v_connection_id;
end;
$$;

create or replace function public.join_session(
  p_access_code text default null,
  p_invite_token text default null
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
  v_session public.sessions%rowtype;
  v_next_status text;
begin
  perform private.assert_account_active(v_user_id);
  if not private.consume_rate_limit(
    v_user_id::text, 'room_join_attempt', 20, 600
  ) then
    return;
  end if;
  if nullif(btrim(p_access_code), '') is null
     and nullif(btrim(p_invite_token), '') is null then
    return;
  end if;

  select session.* into v_session
  from public.sessions session
  where (
    p_invite_token is not null
    and session.invite_token_hash = encode(
      extensions.digest(btrim(p_invite_token), 'sha256'),
      'hex'
    )
  ) or (
    p_invite_token is null
    and session.access_code = upper(btrim(p_access_code))
  )
  for update;

  if not found then
    return;
  end if;
  if exists (
    select 1 from public.participants participant
    where participant.session_id = v_session.id
      and participant.auth_user_id = v_user_id
  ) then
    return query
      select
        v_session.id,
        v_session.status,
        v_session.round_number,
        v_session.expires_at;
    return;
  end if;
  if v_session.expires_at <= now() then
    update public.sessions set status = 'expired' where id = v_session.id;
    return;
  end if;
  if v_session.status <> 'waiting'
     or (
       select count(*) from public.participants participant
       where participant.session_id = v_session.id
     ) >= 2 then
    return;
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner');

  v_next_status := case
    when exists (
      select 1 from public.session_items item
      where item.session_id = v_session.id
    ) then 'active'
    else 'waiting'
  end;
  update public.sessions set status = v_next_status where id = v_session.id;

  return query
    select
      v_session.id,
      v_next_status,
      v_session.round_number,
      v_session.expires_at;
end;
$$;

revoke all on function public.upsert_choosr_profile(text, text) from public;
revoke all on function public.send_connection_request(text) from public;
revoke all on function public.redeem_circle_invite(text) from public;
revoke all on function public.join_session(text, text) from public;
grant execute on function public.upsert_choosr_profile(text, text)
to authenticated;
grant execute on function public.send_connection_request(text)
to authenticated;
grant execute on function public.redeem_circle_invite(text)
to authenticated;
grant execute on function public.join_session(text, text)
to authenticated;
