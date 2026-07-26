-- Clients must be able to verify that notification permission resulted in a
-- server-side delivery endpoint. Return only a boolean; never expose tokens.

create function public.has_registered_push_token()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.device_push_tokens token
      where token.user_id = (select auth.uid())
    );
$$;

revoke all on function public.has_registered_push_token() from public;
grant execute on function public.has_registered_push_token() to authenticated;

comment on function public.has_registered_push_token() is
  'Reports whether the current identity has a server-side push endpoint without exposing token material.';
