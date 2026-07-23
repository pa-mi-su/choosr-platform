begin;
select plan(14);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

create temporary table food_room as
select *
from public.create_decision_session(
  'eat',
  '[
    {"id":"pizza","mode":"eat","title":"Pizza night","kicker":"DINNER","meta":"Casual","description":"Pizza nearby","background":"#7A3428","accent":"#FFC857","tags":["Food"]},
    {"id":"sushi","mode":"eat","title":"Sushi","kicker":"DINNER","meta":"Shareable","description":"Sushi nearby","background":"#173F42","accent":"#78D6C6","tags":["Food"]}
  ]'::jsonb,
  'CA'
);

select is(
  (select mode from public.sessions where id = (select session_id from food_room)),
  'eat',
  'a food room records its decision mode'
);
select is(
  (select region from public.sessions where id = (select session_id from food_room)),
  'CA',
  'the room records its discovery region'
);
select is(
  (select count(*) from public.session_items where session_id = (select session_id from food_room)),
  2::bigint,
  'the full decision deck is frozen'
);
select is(
  (
    select item_payload->>'title'
    from public.session_items
    where session_id = (select session_id from food_room)
      and item_id = 'sushi'
  ),
  'Sushi',
  'display metadata is frozen with the item'
);
select results_eq(
  $$
    select item_id
    from public.session_items
    where session_id = (select session_id from food_room)
    order by position
  $$,
  array['pizza'::text, 'sushi'::text],
  'item order is identical for both participants'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'travel',
      '[{"id":"paris","mode":"travel","title":"Paris"}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'invalid_decision_mode',
  'unsupported modes are rejected'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'do',
      '[{"id":"coffee","mode":"do","title":"Coffee","kicker":"PLAN","meta":"Nearby","description":"Coffee date","background":"#5A3E36","accent":"#D6B18A","tags":["Date"]},{"id":"coffee","mode":"do","title":"Coffee again","kicker":"PLAN","meta":"Nearby","description":"Another coffee date","background":"#5A3E36","accent":"#D6B18A","tags":["Date"]}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'duplicate_deck_item',
  'duplicate local options are rejected'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'watch',
      '[{"id":"missing-title","mode":"watch"}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'invalid_deck_item',
  'incomplete display snapshots are rejected'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'eat',
      '[{"id":"wrong-mode","mode":"do","title":"Bowling"}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'invalid_deck_item',
  'items cannot cross the room mode boundary'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'eat',
      '[{"id":"unsafe","mode":"eat","title":"Unsafe","kicker":"DINNER","meta":"Nearby","description":"Unsafe link","background":"#173F42","accent":"#78D6C6","tags":["Food"],"action":{"label":"Open","url":"http://insecure.example"}}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'invalid_deck_item',
  'unsafe action URLs are rejected before persistence'
);
select lives_ok(
  $$
    select public.validate_decision_deck(
      'eat',
      '[{"id":"google-place","mode":"eat","title":"Restaurant","kicker":"PICK FOOD","meta":"Italian restaurant","description":"123 Main St","background":"#173F42","accent":"#78D6C6","tags":["Food"],"attribution":{"label":"Google Maps · Photo by Example","url":"https://maps.google.com/"}}]'::jsonb
    )
  $$,
  'HTTPS provider attribution is accepted'
);
select throws_ok(
  $$
    select public.validate_decision_deck(
      'eat',
      '[{"id":"unsafe-attribution","mode":"eat","title":"Restaurant","kicker":"PICK FOOD","meta":"Restaurant","description":"123 Main St","background":"#173F42","accent":"#78D6C6","tags":["Food"],"attribution":{"label":"Google Maps","url":"http://insecure.example"}}]'::jsonb
    )
  $$,
  '22023',
  'invalid_deck_item',
  'unsafe attribution URLs are rejected before persistence'
);
select throws_ok(
  $$
    select * from public.create_decision_session(
      'eat',
      jsonb_build_array(jsonb_build_object(
        'id', 'oversized',
        'mode', 'eat',
        'title', 'Oversized',
        'description', repeat('x', 132000)
      )),
      'US'
    )
  $$,
  '22023',
  'deck_payload_too_large',
  'oversized anonymous payloads are rejected'
);
select is(
  (select count(*) from public.sessions),
  1::bigint,
  'invalid room attempts leave no partial sessions'
);

select * from finish();
rollback;
