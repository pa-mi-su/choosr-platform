begin;
select plan(23);

select has_table('public', 'sessions', 'sessions table exists');
select has_table('public', 'participants', 'participants table exists');
select has_table('public', 'session_items', 'session_items table exists');
select has_table('public', 'swipes', 'swipes table exists');
select has_table('public', 'matches', 'matches table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sessions'::regclass),
  'sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'participants has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_items'::regclass),
  'session_items has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.swipes'::regclass),
  'swipes has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.matches'::regclass),
  'matches has RLS enabled'
);

select has_function('public', 'validate_decision_deck', array['text', 'jsonb']);
select has_function('public', 'create_decision_session', array['text', 'jsonb', 'text']);
select has_function('public', 'join_session', array['text', 'text']);
select has_function('public', 'touch_presence', array['uuid']);
select has_function('public', 'submit_swipe', array['uuid', 'integer', 'text', 'text']);
select hasnt_function('public', 'create_session', array['text[]', 'text']);
select has_function('public', 'start_decision_round', array['uuid', 'jsonb']);
select has_function('public', 'cancel_session', array['uuid']);

select has_column('public', 'sessions', 'mode', 'sessions store their decision mode');
select has_column(
  'public',
  'session_items',
  'item_payload',
  'session items freeze display payloads'
);

select policies_are(
  'public',
  'swipes',
  array['swipes_select_only_own'],
  'swipes expose only the owner policy'
);

select results_eq(
  $$ select count(*)::bigint from pg_policies where schemaname = 'public' $$,
  array[5::bigint],
  'exactly five restrictive read policies exist'
);

select results_eq(
  $$ select count(*)::bigint from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE') $$,
  array[0::bigint],
  'authenticated users have no direct table write grants'
);

select * from finish();
rollback;
