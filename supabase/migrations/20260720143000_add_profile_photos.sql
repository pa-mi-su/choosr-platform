alter table public.profiles
add column avatar_path text
constraint profiles_avatar_path_valid check (
  avatar_path is null
  or avatar_path ~ ('^' || user_id::text || '/avatar-[0-9]+\.(jpg|png)$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "profile photo owners can insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "profile photo owners can update"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "profile photo owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop function public.get_choosr_profile();
create function public.get_choosr_profile()
returns table (user_id uuid, display_name text, handle text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.handle, p.avatar_path
  from public.profiles p
  where p.user_id = (select auth.uid());
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
  where c.requester_user_id = (select auth.uid())
     or c.addressee_user_id = (select auth.uid())
  order by (c.status = 'accepted') desc, other_profile.display_name;
$$;

create function public.set_profile_avatar(p_avatar_path text)
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
     and p_avatar_path !~ ('^' || v_user_id::text || '/avatar-[0-9]+\.(jpg|png)$') then
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

revoke all on function public.set_profile_avatar(text) from public;
revoke all on function public.get_choosr_profile() from public;
revoke all on function public.list_circle() from public;
grant execute on function public.set_profile_avatar(text) to authenticated;
grant execute on function public.get_choosr_profile() to authenticated;
grant execute on function public.list_circle() to authenticated;
