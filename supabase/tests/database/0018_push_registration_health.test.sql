begin;
select plan(5);

select has_function(
  'public',
  'has_registered_push_token',
  array[]::text[],
  'push registration health is exposed through a bounded RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.has_registered_push_token()',
    'execute'
  ),
  'anonymous callers cannot inspect push registration health'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.has_registered_push_token()',
    'execute'
  ),
  'authenticated callers can inspect their own push registration health'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values (
  'd0000000-0000-0000-0000-000000000018',
  'authenticated',
  'authenticated',
  true,
  now(),
  now()
);
set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000018';

select is(
  public.has_registered_push_token(),
  false,
  'an identity without a device endpoint is reported unhealthy'
);

select public.register_push_token('ios', 'ios-health-token-aaaaaaaaaaaa');
select is(
  public.has_registered_push_token(),
  true,
  'a registered endpoint makes push health ready'
);

select * from finish();
rollback;
