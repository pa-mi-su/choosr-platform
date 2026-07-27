-- Anonymous Choosr identities are device-scoped. Keep only the current
-- platform token for that identity so an APNs/FCM rebind replaces, rather than
-- accumulates beside, a stale installation endpoint.

create or replace function public.register_push_token(
  p_platform text,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_token text := btrim(p_token);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_platform not in ('ios', 'android')
     or length(v_token) not between 20 and 4096 then
    raise exception using errcode = '22023', message = 'invalid_push_token';
  end if;

  delete from public.device_push_tokens
  where user_id = v_user_id
    and platform = p_platform
    and token <> v_token;

  insert into public.device_push_tokens (user_id, platform, token)
  values (v_user_id, p_platform, v_token)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

comment on function public.register_push_token(text, text) is
  'Registers the current device-scoped push endpoint and replaces stale tokens for the same platform.';
