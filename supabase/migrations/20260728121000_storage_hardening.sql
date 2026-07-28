-- Storage authorization is enforced against exact Choosr object names, not
-- merely a user-controlled first path segment.

create function private.storage_upload_allowed(
  p_bucket_id text,
  p_name text,
  p_max_objects integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_object_count integer;
begin
  if v_user_id is null or p_max_objects not between 1 and 1000 then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bucket_id || ':' || v_user_id::text, 0)
  );
  select count(*) into v_object_count
  from storage.objects object
  where object.bucket_id = p_bucket_id
    and (storage.foldername(object.name))[1] = v_user_id::text;

  return v_object_count < p_max_objects
    and case p_bucket_id
      when 'profile-photos' then
        p_name ~ (
          '^' || v_user_id::text || '/avatar-[0-9]{10,16}\.(jpg|png|webp)$'
        )
      when 'decision-photos' then
        p_name ~ (
          '^' || v_user_id::text ||
          '/choice-[0-9]{10,16}-([0-9]|10)\.(jpg|png|webp)$'
        )
      else false
    end;
end;
$$;

revoke all on function private.storage_upload_allowed(text, text, integer)
from public, anon, authenticated;

drop policy if exists "profile photo owners can insert" on storage.objects;
drop policy if exists "profile photo owners can update" on storage.objects;
drop policy if exists "profile photo owners can delete" on storage.objects;

create policy "profile photo owners can insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and private.storage_upload_allowed(bucket_id, name, 2)
);

create policy "profile photo owners can update"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and name ~ (
    '^' || (select auth.uid())::text ||
    '/avatar-[0-9]{10,16}\.(jpg|png|webp)$'
  )
);

create policy "profile photo owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "decision photo owners can insert" on storage.objects;
drop policy if exists "decision photo owners can select" on storage.objects;
drop policy if exists "decision photo owners can delete" on storage.objects;

create policy "decision photo owners can insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'decision-photos'
  and private.storage_upload_allowed(bucket_id, name, 200)
);

create policy "decision photo owners can select"
on storage.objects for select to authenticated
using (
  bucket_id = 'decision-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "decision photo owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'decision-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create function public.list_storage_cleanup_candidates(p_limit integer default 500)
returns table (bucket_id text, object_name text)
language sql
security definer
set search_path = ''
as $$
  select object.bucket_id, object.name
  from storage.objects object
  where (
    object.bucket_id = 'profile-photos'
    and object.created_at < now() - interval '2 hours'
    and not exists (
      select 1 from public.profiles profile
      where profile.avatar_path = object.name
    )
  ) or (
    object.bucket_id = 'decision-photos'
    and object.created_at < now() - interval '72 hours'
    and not exists (
      select 1 from public.session_items item
      where position(object.name in item.item_payload::text) > 0
    )
  )
  order by object.created_at
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.list_storage_cleanup_candidates(integer)
from public, anon, authenticated;
grant execute on function public.list_storage_cleanup_candidates(integer)
to service_role;

create function private.dispatch_storage_cleanup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_publishable_key text;
  v_job_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'choosr_project_url';
  select decrypted_secret into v_publishable_key
  from vault.decrypted_secrets where name = 'choosr_publishable_key';
  select decrypted_secret into v_job_token
  from vault.decrypted_secrets where name = 'choosr_storage_cleanup_token';

  if v_project_url is null
     or v_publishable_key is null
     or v_job_token is null then
    return null;
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/cleanup-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_publishable_key,
      'x-choosr-job-token', v_job_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function private.dispatch_storage_cleanup()
from public, anon, authenticated;

select cron.schedule(
  'choosr-storage-cleanup',
  '37 5 * * *',
  $job$ select private.dispatch_storage_cleanup(); $job$
);

comment on function public.list_storage_cleanup_candidates(integer) is
  'Service-only bounded list. Deletion is performed through the Storage API so database and object storage remain consistent.';
