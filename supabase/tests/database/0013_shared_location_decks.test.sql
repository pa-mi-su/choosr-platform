begin;
select plan(17);

select has_table(
  'public',
  'session_locations',
  'room-scoped participant locations are stored separately'
);
select has_function(
  'public',
  'create_location_decision_session',
  array['text', 'double precision', 'double precision', 'text', 'text']
);
select has_function(
  'public',
  'record_session_location',
  array['uuid', 'uuid', 'double precision', 'double precision', 'text']
);
select has_function(
  'public',
  'finalize_location_session',
  array['uuid', 'jsonb']
);
select has_function(
  'public',
  'get_location_deck_context',
  array['uuid', 'uuid']
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now()),
  ('d0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';

create temporary table location_room as
select *
from public.create_location_decision_session(
  'do',
  28.5383,
  -81.3792,
  'Orlando, Florida',
  'US'
);

select is(
  (select status from public.sessions where id = (select session_id from location_room)),
  'waiting',
  'a location room waits for its second participant'
);
select is(
  (select count(*) from public.session_items where session_id = (select session_id from location_room)),
  0::bigint,
  'the deck is prepared after the invited participant joins'
);
select is(
  (select count(*) from public.session_locations where session_id = (select session_id from location_room)),
  1::bigint,
  'the host location is stored for this room'
);

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';

select *
from public.join_session((select access_code from location_room), null);

select is(
  (select status from public.sessions where id = (select session_id from location_room)),
  'waiting',
  'joining waits briefly while the host-selected deck is prepared'
);

select is(
  (
    select count(*)
    from public.get_location_deck_context(
      (select session_id from location_room),
      'd0000000-0000-0000-0000-000000000002'
    )
  ),
  1::bigint,
  'the deck worker receives one creator-owned location'
);
select is(
  (
    select location_label
    from public.get_location_deck_context(
      (select session_id from location_room),
      'd0000000-0000-0000-0000-000000000002'
    )
  ),
  'Orlando, Florida',
  'the invited participant reuses the creator location'
);

select public.finalize_location_session(
  (select session_id from location_room),
  '[
    {"id":"google:one","mode":"do","title":"Museum","kicker":"PICK AN ACTIVITY","meta":"Museum · 8 mi","description":"Creator location choice","background":"#20344A","accent":"#F0B7A4","tags":["Activity"]},
    {"id":"google:two","mode":"do","title":"Bowling","kicker":"PICK AN ACTIVITY","meta":"Bowling · 9 mi","description":"Creator location choice","background":"#39464C","accent":"#E9D9BE","tags":["Activity"]}
  ]'::jsonb
);

select is(
  (select status from public.sessions where id = (select session_id from location_room)),
  'active',
  'the room activates only after the shared deck is persisted'
);
select is(
  (select count(*) from public.session_items where session_id = (select session_id from location_room)),
  2::bigint,
  'both participants receive one persisted shared deck'
);

select is(
  (
    select count(*)
    from public.session_locations
    where session_id = (select session_id from location_room)
  ),
  0::bigint,
  'ephemeral coordinates are erased as soon as the deck is finalized'
);
select lives_ok(
  format(
    'select public.finalize_location_session(%L, %L::jsonb)',
    (select session_id from location_room),
    '[
      {"id":"google:one","mode":"do","title":"Museum","kicker":"PICK AN ACTIVITY","meta":"Museum · 8 mi","description":"Creator location choice","background":"#20344A","accent":"#F0B7A4","tags":["Activity"]},
      {"id":"google:two","mode":"do","title":"Bowling","kicker":"PICK AN ACTIVITY","meta":"Bowling · 9 mi","description":"Creator location choice","background":"#39464C","accent":"#E9D9BE","tags":["Activity"]}
    ]'
  ),
  'concurrent deck finalization is idempotent after creator coordinates are erased'
);

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';

create temporary table distant_room as
select *
from public.create_location_decision_session(
  'do',
  28.5383,
  -81.3792,
  'Orlando, Florida',
  'US'
);

set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000002';

select *
from public.join_session((select access_code from distant_room), null);

select throws_ok(
  format(
    $query$
      select *
      from public.record_session_location(
        %L,
        'd0000000-0000-0000-0000-000000000002',
        27.9506,
        -82.4572,
        'Tampa, Florida'
      )
    $query$,
    (select session_id from distant_room)
  ),
  '42501',
  'location_submission_not_allowed',
  'the invited participant cannot replace the creator location'
);

select is(
  (
    select count(*)
    from public.session_locations
    where session_id = (select session_id from distant_room)
  ),
  1::bigint,
  'only the creator location remains stored'
);

select * from finish();
rollback;
