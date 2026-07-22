alter table public.sessions drop constraint sessions_mode_valid;
alter table public.sessions add constraint sessions_mode_valid
  check (mode in ('watch', 'eat', 'do', 'custom'));

create or replace function public.validate_decision_deck(p_mode text, p_items jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item_count integer;
begin
  if p_mode is null or p_mode not in ('watch', 'eat', 'do', 'custom') then
    raise exception using errcode = '22023', message = 'invalid_decision_mode';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'deck_must_be_an_array';
  end if;
  if octet_length(p_items::text) > 131072 then
    raise exception using errcode = '22023', message = 'deck_payload_too_large';
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
      or length(item->>'id') > 200
      or nullif(btrim(item->>'title'), '') is null
      or length(item->>'title') > 160
      or item->>'mode' is distinct from p_mode
      or nullif(btrim(item->>'kicker'), '') is null
      or length(item->>'kicker') > 80
      or nullif(btrim(item->>'meta'), '') is null
      or length(item->>'meta') > 240
      or nullif(btrim(item->>'description'), '') is null
      or length(item->>'description') > 2000
      or (item->>'background' ~ '^#[0-9A-Fa-f]{6}$') is distinct from true
      or (item->>'accent' ~ '^#[0-9A-Fa-f]{6}$') is distinct from true
      or (item ? 'imageUrl' and (
        length(item->>'imageUrl') > 4096
        or item->>'imageUrl' !~ '^https://'
      ))
      or case
        when jsonb_typeof(item->'tags') is distinct from 'array' then true
        else jsonb_array_length(item->'tags') > 12
          or exists (
            select 1 from jsonb_array_elements(item->'tags') tag
            where jsonb_typeof(tag) <> 'string' or length(tag #>> '{}') > 40
          )
      end
      or (item ? 'action' and (
        jsonb_typeof(item->'action') is distinct from 'object'
        or nullif(btrim(item#>>'{action,label}'), '') is null
        or length(item#>>'{action,label}') > 120
        or nullif(btrim(item#>>'{action,url}'), '') is null
        or length(item#>>'{action,url}') > 2048
        or item#>>'{action,url}' !~ '^https://'
      ))
  ) then
    raise exception using errcode = '22023', message = 'invalid_deck_item';
  end if;
  if (
    select count(distinct item->>'id') from jsonb_array_elements(p_items) item
  ) <> v_item_count then
    raise exception using errcode = '22023', message = 'duplicate_deck_item';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'decision-photos',
  'decision-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "decision photo owners can insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'decision-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
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
