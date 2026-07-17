create extension if not exists pgcrypto with schema extensions;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  access_code text not null unique
    constraint sessions_access_code_format check (access_code ~ '^[A-F0-9]{8}$'),
  invite_token_hash text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'watch'
    constraint sessions_mode_valid check (mode in ('watch', 'eat', 'do')),
  status text not null default 'waiting'
    constraint sessions_status_valid check (
      status in ('waiting', 'active', 'matched', 'completed', 'expired', 'cancelled')
    ),
  region text not null default 'US'
    constraint sessions_region_format check (region ~ '^[A-Z]{2}$'),
  round_number integer not null default 1
    constraint sessions_round_positive check (round_number > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  matched_at timestamptz,
  constraint sessions_expiration_after_creation check (expires_at > created_at)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null constraint participants_role_valid check (role in ('host', 'partner')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, auth_user_id),
  unique (session_id, role),
  unique (id, session_id)
);

create table public.session_items (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  round integer not null constraint session_items_round_positive check (round > 0),
  item_id text not null constraint session_items_item_present check (length(btrim(item_id)) > 0),
  item_payload jsonb not null default '{}'::jsonb
    constraint session_items_payload_object check (jsonb_typeof(item_payload) = 'object'),
  position integer not null constraint session_items_position_positive check (position > 0),
  created_at timestamptz not null default now(),
  unique (session_id, round, item_id),
  unique (session_id, round, position)
);

create table public.swipes (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null,
  round integer not null constraint swipes_round_positive check (round > 0),
  item_id text not null,
  direction text not null constraint swipes_direction_valid check (direction in ('left', 'right')),
  created_at timestamptz not null default now(),
  unique (participant_id, round, item_id),
  foreign key (participant_id, session_id)
    references public.participants(id, session_id) on delete cascade,
  foreign key (session_id, round, item_id)
    references public.session_items(session_id, round, item_id) on delete cascade
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  round integer not null constraint matches_round_positive check (round > 0),
  item_id text not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, round, item_id)
    references public.session_items(session_id, round, item_id) on delete restrict
);

create index participants_auth_user_idx on public.participants (auth_user_id, session_id);
create index sessions_expires_at_idx on public.sessions (expires_at);
create index swipes_match_lookup_idx
  on public.swipes (session_id, round, item_id, direction);

alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.session_items enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;

create function public.is_session_participant(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants p
    where p.session_id = p_session_id
      and p.auth_user_id = p_user_id
  );
$$;

create function public.participant_id_for_user(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.participants p
  where p.session_id = p_session_id
    and p.auth_user_id = p_user_id;
$$;

create policy sessions_select_members
  on public.sessions for select to authenticated
  using (public.is_session_participant(id));

create policy participants_select_session_members
  on public.participants for select to authenticated
  using (public.is_session_participant(session_id));

create policy session_items_select_session_members
  on public.session_items for select to authenticated
  using (public.is_session_participant(session_id));

create policy swipes_select_only_own
  on public.swipes for select to authenticated
  using (participant_id = public.participant_id_for_user(session_id));

create policy matches_select_session_members
  on public.matches for select to authenticated
  using (public.is_session_participant(session_id));

revoke all on public.sessions from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.session_items from anon, authenticated;
revoke all on public.swipes from anon, authenticated;
revoke all on public.matches from anon, authenticated;

grant select on public.sessions to authenticated;
grant select on public.participants to authenticated;
grant select on public.session_items to authenticated;
grant select on public.swipes to authenticated;
grant select on public.matches to authenticated;

create function public.create_session(
  p_item_ids text[],
  p_region text default 'US'
)
returns table (
  session_id uuid,
  access_code text,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_access_code text;
  v_invite_token text;
  v_expires_at timestamptz;
  v_region text := upper(btrim(p_region));
  v_item_count integer := coalesce(array_length(p_item_ids, 1), 0);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_region !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_region';
  end if;
  if v_item_count < 1 or v_item_count > 100 then
    raise exception using errcode = '22023', message = 'deck_size_out_of_range';
  end if;
  if exists (select 1 from unnest(p_item_ids) item where item is null or btrim(item) = '') then
    raise exception using errcode = '22023', message = 'invalid_deck_item';
  end if;
  if (select count(distinct item) from unnest(p_item_ids) item) <> v_item_count then
    raise exception using errcode = '22023', message = 'duplicate_deck_item';
  end if;

  loop
    v_access_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    v_invite_token := encode(extensions.gen_random_bytes(24), 'hex');
    begin
      insert into public.sessions (
        access_code,
        invite_token_hash,
        host_user_id,
        region
      ) values (
        v_access_code,
        encode(extensions.digest(v_invite_token, 'sha256'), 'hex'),
        v_user_id,
        v_region
      )
      returning id, public.sessions.expires_at
      into v_session_id, v_expires_at;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session_id, v_user_id, 'host');

  insert into public.session_items (session_id, round, item_id, position)
  select v_session_id, 1, item, ordinal::integer
  from unnest(p_item_ids) with ordinality as deck(item, ordinal);

  return query select v_session_id, v_access_code, v_invite_token, v_expires_at;
end;
$$;

create function public.create_decision_session(
  p_mode text,
  p_items jsonb,
  p_region text default 'US'
)
returns table (
  session_id uuid,
  access_code text,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid;
  v_access_code text;
  v_invite_token text;
  v_expires_at timestamptz;
  v_mode text := lower(btrim(p_mode));
  v_region text := upper(btrim(p_region));
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_mode not in ('watch', 'eat', 'do') then
    raise exception using errcode = '22023', message = 'invalid_decision_mode';
  end if;
  if v_region !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_region';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'deck_must_be_an_array';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception using errcode = '22023', message = 'deck_size_out_of_range';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(item->>'id'), '') is null
      or nullif(btrim(item->>'title'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_deck_item';
  end if;
  if (
    select count(distinct item->>'id')
    from jsonb_array_elements(p_items) item
  ) <> v_item_count then
    raise exception using errcode = '22023', message = 'duplicate_deck_item';
  end if;

  loop
    v_access_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    v_invite_token := encode(extensions.gen_random_bytes(24), 'hex');
    begin
      insert into public.sessions (
        access_code,
        invite_token_hash,
        host_user_id,
        mode,
        region
      ) values (
        v_access_code,
        encode(extensions.digest(v_invite_token, 'sha256'), 'hex'),
        v_user_id,
        v_mode,
        v_region
      )
      returning id, public.sessions.expires_at
      into v_session_id, v_expires_at;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session_id, v_user_id, 'host');

  insert into public.session_items (
    session_id,
    round,
    item_id,
    item_payload,
    position
  )
  select
    v_session_id,
    1,
    item->>'id',
    item,
    ordinal::integer
  from jsonb_array_elements(p_items) with ordinality as deck(item, ordinal);

  return query select v_session_id, v_access_code, v_invite_token, v_expires_at;
end;
$$;

create function public.join_session(
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
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if nullif(btrim(p_access_code), '') is null
     and nullif(btrim(p_invite_token), '') is null then
    raise exception using errcode = '22023', message = 'invite_required';
  end if;

  select s.* into v_session
  from public.sessions s
  where (
      p_invite_token is not null
      and s.invite_token_hash = encode(
        extensions.digest(btrim(p_invite_token), 'sha256'),
        'hex'
      )
    ) or (
      p_invite_token is null
      and s.access_code = upper(btrim(p_access_code))
    )
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  if exists (
    select 1 from public.participants p
    where p.session_id = v_session.id and p.auth_user_id = v_user_id
  ) then
    return query
      select v_session.id, v_session.status, v_session.round_number, v_session.expires_at;
    return;
  end if;

  if v_session.expires_at <= now() then
    update public.sessions set status = 'expired' where id = v_session.id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;
  if v_session.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_unavailable';
  end if;
  if (select count(*) from public.participants p where p.session_id = v_session.id) >= 2 then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.participants (session_id, auth_user_id, role)
  values (v_session.id, v_user_id, 'partner');

  update public.sessions set status = 'active' where id = v_session.id;

  return query
    select v_session.id, 'active'::text, v_session.round_number, v_session.expires_at;
end;
$$;

create function public.touch_presence(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.participants
  set last_seen_at = now()
  where session_id = p_session_id
    and auth_user_id = (select auth.uid());

  if not found then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;
end;
$$;

create function public.submit_swipe(
  p_session_id uuid,
  p_round integer,
  p_item_id text,
  p_direction text
)
returns table (
  outcome text,
  match_id uuid,
  matched_item_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_participant_id uuid;
  v_session public.sessions%rowtype;
  v_existing_direction text;
  v_match_id uuid;
  v_match_item text;
  v_item_count integer;
  v_user_swipe_count integer;
  v_finished_participants integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_direction not in ('left', 'right') then
    raise exception using errcode = '22023', message = 'invalid_swipe_direction';
  end if;

  select p.id into v_participant_id
  from public.participants p
  where p.session_id = p_session_id and p.auth_user_id = v_user_id;

  if v_participant_id is null then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;

  select s.* into v_session
  from public.sessions s
  where s.id = p_session_id
  for update;

  if v_session.expires_at <= now() then
    update public.sessions set status = 'expired' where id = p_session_id;
    raise exception using errcode = 'P0001', message = 'room_expired';
  end if;

  if v_session.status = 'matched' then
    select m.id, m.item_id into v_match_id, v_match_item
    from public.matches m where m.session_id = p_session_id;
    return query select 'match'::text, v_match_id, v_match_item;
    return;
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'room_not_active';
  end if;
  if p_round <> v_session.round_number then
    raise exception using errcode = '22023', message = 'wrong_round';
  end if;
  if not exists (
    select 1 from public.session_items si
    where si.session_id = p_session_id
      and si.round = p_round
      and si.item_id = p_item_id
  ) then
    raise exception using errcode = '22023', message = 'item_not_in_deck';
  end if;

  select s.direction into v_existing_direction
  from public.swipes s
  where s.participant_id = v_participant_id
    and s.round = p_round
    and s.item_id = p_item_id;

  if v_existing_direction is not null and v_existing_direction <> p_direction then
    raise exception using errcode = '23505', message = 'swipe_already_submitted';
  end if;
  if v_existing_direction is null then
    insert into public.swipes (
      session_id,
      participant_id,
      round,
      item_id,
      direction
    ) values (
      p_session_id,
      v_participant_id,
      p_round,
      p_item_id,
      p_direction
    );
  end if;

  if p_direction = 'right' and exists (
    select 1
    from public.swipes other_swipe
    where other_swipe.session_id = p_session_id
      and other_swipe.round = p_round
      and other_swipe.item_id = p_item_id
      and other_swipe.direction = 'right'
      and other_swipe.participant_id <> v_participant_id
  ) then
    insert into public.matches (session_id, round, item_id)
    values (p_session_id, p_round, p_item_id)
    on conflict (session_id) do nothing;

    select m.id, m.item_id into v_match_id, v_match_item
    from public.matches m where m.session_id = p_session_id;

    update public.sessions
    set status = 'matched', matched_at = coalesce(matched_at, now())
    where id = p_session_id;

    return query select 'match'::text, v_match_id, v_match_item;
    return;
  end if;

  select count(*) into v_item_count
  from public.session_items si
  where si.session_id = p_session_id and si.round = p_round;

  select count(*) into v_user_swipe_count
  from public.swipes s
  where s.participant_id = v_participant_id and s.round = p_round;

  select count(*) into v_finished_participants
  from (
    select s.participant_id
    from public.swipes s
    where s.session_id = p_session_id and s.round = p_round
    group by s.participant_id
    having count(*) = v_item_count
  ) finished;

  if v_finished_participants = 2 then
    update public.sessions set status = 'completed' where id = p_session_id;
    return query select 'no-match'::text, null::uuid, null::text;
  elsif v_user_swipe_count = v_item_count then
    return query select 'waiting'::text, null::uuid, null::text;
  else
    return query select 'next'::text, null::uuid, null::text;
  end if;
end;
$$;

create function public.start_new_round(
  p_session_id uuid,
  p_item_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_next_round integer;
  v_item_count integer := coalesce(array_length(p_item_ids, 1), 0);
begin
  if not public.is_session_participant(p_session_id) then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;
  if v_item_count < 1 or v_item_count > 100 then
    raise exception using errcode = '22023', message = 'deck_size_out_of_range';
  end if;
  if exists (select 1 from unnest(p_item_ids) item where item is null or btrim(item) = '')
     or (select count(distinct item) from unnest(p_item_ids) item) <> v_item_count then
    raise exception using errcode = '22023', message = 'invalid_deck';
  end if;

  select s.* into v_session
  from public.sessions s where s.id = p_session_id for update;

  if v_session.status <> 'completed' then
    raise exception using errcode = 'P0001', message = 'round_cannot_restart';
  end if;

  v_next_round := v_session.round_number + 1;
  insert into public.session_items (session_id, round, item_id, position)
  select p_session_id, v_next_round, item, ordinal::integer
  from unnest(p_item_ids) with ordinality as deck(item, ordinal);

  update public.sessions
  set status = 'active', round_number = v_next_round
  where id = p_session_id;

  return v_next_round;
end;
$$;

create function public.start_decision_round(
  p_session_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_next_round integer;
  v_item_count integer;
begin
  if not public.is_session_participant(p_session_id) then
    raise exception using errcode = '42501', message = 'not_a_session_participant';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'deck_must_be_an_array';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception using errcode = '22023', message = 'deck_size_out_of_range';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(item->>'id'), '') is null
      or nullif(btrim(item->>'title'), '') is null
  ) or (
    select count(distinct item->>'id')
    from jsonb_array_elements(p_items) item
  ) <> v_item_count then
    raise exception using errcode = '22023', message = 'invalid_deck';
  end if;

  select s.* into v_session
  from public.sessions s where s.id = p_session_id for update;

  if v_session.status <> 'completed' then
    raise exception using errcode = 'P0001', message = 'round_cannot_restart';
  end if;

  v_next_round := v_session.round_number + 1;
  insert into public.session_items (
    session_id,
    round,
    item_id,
    item_payload,
    position
  )
  select
    p_session_id,
    v_next_round,
    item->>'id',
    item,
    ordinal::integer
  from jsonb_array_elements(p_items) with ordinality as deck(item, ordinal);

  update public.sessions
  set status = 'active', round_number = v_next_round
  where id = p_session_id;

  return v_next_round;
end;
$$;

create function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions
  set status = 'cancelled'
  where id = p_session_id
    and host_user_id = (select auth.uid())
    and status in ('waiting', 'active');

  if not found then
    raise exception using errcode = '42501', message = 'session_cannot_be_cancelled';
  end if;
end;
$$;

create function public.cleanup_expired_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  update public.sessions
  set status = 'expired'
  where expires_at <= now()
    and status in ('waiting', 'active', 'completed');

  delete from public.sessions
  where expires_at <= now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.is_session_participant(uuid, uuid) from public;
revoke all on function public.participant_id_for_user(uuid, uuid) from public;
revoke all on function public.create_session(text[], text) from public;
revoke all on function public.create_decision_session(text, jsonb, text) from public;
revoke all on function public.join_session(text, text) from public;
revoke all on function public.touch_presence(uuid) from public;
revoke all on function public.submit_swipe(uuid, integer, text, text) from public;
revoke all on function public.start_new_round(uuid, text[]) from public;
revoke all on function public.start_decision_round(uuid, jsonb) from public;
revoke all on function public.cancel_session(uuid) from public;
revoke all on function public.cleanup_expired_sessions() from public;

grant execute on function public.is_session_participant(uuid, uuid) to authenticated;
grant execute on function public.participant_id_for_user(uuid, uuid) to authenticated;
grant execute on function public.create_session(text[], text) to authenticated;
grant execute on function public.create_decision_session(text, jsonb, text) to authenticated;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.touch_presence(uuid) to authenticated;
grant execute on function public.submit_swipe(uuid, integer, text, text) to authenticated;
grant execute on function public.start_new_round(uuid, text[]) to authenticated;
grant execute on function public.start_decision_round(uuid, jsonb) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end;
$$;

comment on table public.swipes is
  'Private participant decisions. RLS permits each user to select only their own rows.';
comment on function public.submit_swipe(uuid, integer, text, text) is
  'Stores an immutable swipe and atomically creates at most one authoritative match per session.';
