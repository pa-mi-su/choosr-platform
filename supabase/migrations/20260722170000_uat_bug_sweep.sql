-- UAT hardening: durable circle lifecycle, notification management, and WebP avatars.

alter table public.profiles
  drop constraint profiles_avatar_path_valid;
alter table public.profiles
  add constraint profiles_avatar_path_valid check (
    avatar_path is null
    or avatar_path ~ ('^' || user_id::text || '/avatar-[0-9]+\.(jpg|png|webp)$')
  );

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'profile-photos';

create or replace function public.set_profile_avatar(p_avatar_path text)
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
  if p_avatar_path is not null
     and p_avatar_path !~ ('^' || v_user_id::text || '/avatar-[0-9]+\.(jpg|png|webp)$') then
    raise exception using errcode = '22023', message = 'invalid_avatar_path';
  end if;

  update public.profiles
  set avatar_path = p_avatar_path, updated_at = now()
  where user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
end;
$$;

alter table public.connections
  drop constraint connections_status_valid;
alter table public.connections
  add constraint connections_status_valid check (
    status in ('pending', 'accepted', 'declined', 'removed')
  );
alter table public.connections add column removed_at timestamptz;

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
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'profile_required';
  end if;

  select p.user_id into v_recipient_id
  from public.profiles p
  where p.handle = lower(btrim(p_handle));
  if v_recipient_id is null then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if v_recipient_id = v_user_id then
    raise exception using errcode = '22023', message = 'cannot_connect_to_self';
  end if;

  select c.* into v_connection
  from public.connections c
  where least(c.requester_user_id, c.addressee_user_id) = least(v_user_id, v_recipient_id)
    and greatest(c.requester_user_id, c.addressee_user_id) = greatest(v_user_id, v_recipient_id)
  for update;

  if found then
    if v_connection.status not in ('removed', 'declined') then
      raise exception using errcode = '23505', message = 'connection_already_exists';
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

  insert into public.notification_outbox (
    recipient_user_id, kind, payload, dedupe_key
  ) values (
    v_recipient_id,
    'connection_request',
    jsonb_build_object('connection_id', v_connection_id, 'sender_user_id', v_user_id),
    v_dedupe_key
  );
  return v_connection_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'connection_already_exists';
end;
$$;

create function public.remove_circle_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connections
  set status = 'removed', removed_at = now()
  where id = p_connection_id
    and (
      requester_user_id = (select auth.uid())
      or addressee_user_id = (select auth.uid())
    )
    and status in ('pending', 'accepted');
  if not found then
    raise exception using errcode = '42501', message = 'connection_unavailable';
  end if;

  update public.room_invitations
  set status = 'cancelled', responded_at = now()
  where connection_id = p_connection_id and status = 'pending';
end;
$$;

drop function public.list_circle();
create function public.list_circle()
returns table (
  connection_id uuid,
  person_user_id uuid,
  display_name text,
  handle text,
  avatar_path text,
  status text,
  direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    other_profile.user_id,
    other_profile.display_name,
    other_profile.handle,
    other_profile.avatar_path,
    c.status,
    case when c.requester_user_id = (select auth.uid()) then 'outgoing' else 'incoming' end
  from public.connections c
  join public.profiles other_profile
    on other_profile.user_id = case
      when c.requester_user_id = (select auth.uid()) then c.addressee_user_id
      else c.requester_user_id
    end
  where (c.requester_user_id = (select auth.uid())
     or c.addressee_user_id = (select auth.uid()))
    and c.status in ('pending', 'accepted')
  order by (c.status = 'accepted') desc, other_profile.display_name;
$$;

revoke all on function public.remove_circle_connection(uuid) from public;
revoke all on function public.list_circle() from public;
grant execute on function public.remove_circle_connection(uuid) to authenticated;
grant execute on function public.list_circle() to authenticated;

alter table public.user_notifications add column deleted_at timestamptz;
drop index user_notifications_unread_idx;
create index user_notifications_unread_idx
  on public.user_notifications (recipient_user_id, created_at desc)
  where read_at is null and deleted_at is null;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.user_notifications
  where recipient_user_id = (select auth.uid())
    and read_at is null
    and deleted_at is null;
$$;

create function public.delete_notifications(p_notification_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.user_notifications
  set deleted_at = now(), read_at = coalesce(read_at, now())
  where recipient_user_id = (select auth.uid())
    and deleted_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.delete_notifications(bigint[]) from public;
grant execute on function public.delete_notifications(bigint[]) to authenticated;
