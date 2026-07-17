begin;
select plan(9);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

create temporary table food_room as
select *
from public.create_decision_session(
  'eat',
  '[
    {"id":"pizza","title":"Pizza night","meta":"Casual"},
    {"id":"sushi","title":"Sushi","meta":"Shareable"}
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
      '[{"id":"paris","title":"Paris"}]'::jsonb,
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
      '[{"id":"coffee","title":"Coffee"},{"id":"coffee","title":"Coffee again"}]'::jsonb,
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
      '[{"id":"missing-title"}]'::jsonb,
      'US'
    )
  $$,
  '22023',
  'invalid_deck_item',
  'incomplete display snapshots are rejected'
);
select is(
  (select count(*) from public.sessions),
  1::bigint,
  'invalid room attempts leave no partial sessions'
);

select * from finish();
rollback;
