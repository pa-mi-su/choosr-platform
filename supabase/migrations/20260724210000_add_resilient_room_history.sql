create or replace function public.list_active_room_history()
returns table (
  session_id uuid,
  access_code text,
  mode text,
  status text,
  round_number integer,
  expires_at timestamptz,
  created_at timestamptz,
  participant_count bigint,
  total_choices bigint,
  completed_choices bigint,
  matched_item_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.access_code,
    s.mode,
    s.status,
    s.round_number,
    s.expires_at,
    s.created_at,
    (
      select count(*)
      from public.participants p
      where p.session_id = s.id
    ),
    (
      select count(*)
      from public.session_items si
      where si.session_id = s.id
        and si.round = s.round_number
    ),
    (
      select count(*)
      from public.swipes sw
      where sw.session_id = s.id
        and sw.round = s.round_number
        and sw.participant_id =
          public.participant_id_for_user(s.id, (select auth.uid()))
    ),
    (
      select m.item_id
      from public.matches m
      where m.session_id = s.id
        and m.round = s.round_number
      limit 1
    )
  from public.sessions s
  where (select auth.uid()) is not null
    and s.status in ('waiting', 'active')
    and s.expires_at > now()
    and exists (
      select 1
      from public.participants own_participant
      where own_participant.session_id = s.id
        and own_participant.auth_user_id = (select auth.uid())
    )
  order by s.created_at desc
  limit 30;
$$;

revoke all on function public.list_active_room_history() from public;
grant execute on function public.list_active_room_history() to authenticated;
