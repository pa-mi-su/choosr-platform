begin;
select plan(7);

select has_column(
  'public',
  'sessions',
  'cuisine_filter',
  'rooms persist the creator food preference'
);
select has_function(
  'public',
  'create_location_decision_session',
  array[
    'text',
    'double precision',
    'double precision',
    'text',
    'text',
    'text'
  ],
  'location room creation accepts a cuisine filter'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_location_decision_session(text,double precision,double precision,text,text,text)',
    'execute'
  ),
  'authenticated creators can create cuisine-filtered food rooms'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());

set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

create temporary table mexican_room as
select *
from public.create_location_decision_session(
  p_mode => 'eat',
  p_latitude => 28.5383,
  p_longitude => -81.3792,
  p_location_label => 'Orlando, Florida',
  p_region => 'US',
  p_cuisine_filter => 'mexican'
);

select is(
  (
    select cuisine_filter
    from public.sessions
    where id = (select session_id from mexican_room)
  ),
  'mexican',
  'the selected food cuisine is stored on the room'
);
select is(
  (
    select cuisine_filter
    from public.get_location_deck_context(
      (select session_id from mexican_room),
      'a0000000-0000-0000-0000-000000000001'
    )
  ),
  'mexican',
  'the deck worker receives the persisted cuisine'
);

create temporary table activity_room as
select *
from public.create_location_decision_session(
  p_mode => 'do',
  p_latitude => 28.5383,
  p_longitude => -81.3792,
  p_location_label => 'Orlando, Florida',
  p_region => 'US',
  p_cuisine_filter => 'mexican'
);

select is(
  (
    select cuisine_filter
    from public.sessions
    where id = (select session_id from activity_room)
  ),
  'all',
  'non-food rooms cannot retain a cuisine filter'
);

select throws_ok(
  $$
    select *
    from public.create_location_decision_session(
      p_mode => 'eat',
      p_latitude => 28.5383,
      p_longitude => -81.3792,
      p_location_label => 'Orlando, Florida',
      p_region => 'US',
      p_cuisine_filter => 'made-up'
    )
  $$,
  '22023',
  'invalid_cuisine_filter',
  'unknown cuisine values are rejected at the database boundary'
);

select * from finish();
rollback;
