begin;
select plan(13);

select has_table(
  'public',
  'push_registration_health',
  'push registration health table exists'
);
select has_column(
  'public',
  'device_push_tokens',
  'invalidated_at',
  'invalid endpoints are retained'
);
select has_column(
  'public',
  'device_push_tokens',
  'last_delivery_error',
  'provider delivery errors are retained'
);
select has_function(
  'public',
  'report_push_registration',
  array['text', 'text', 'text', 'text', 'text', 'text'],
  'clients can report bounded registration health'
);
select has_function(
  'public',
  'push_token_status',
  array['text'],
  'clients can inspect only the status of a token they already possess'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.report_push_registration(text,text,text,text,text,text)',
    'execute'
  ),
  'unauthenticated callers cannot report push health'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values (
  'd0000000-0000-0000-0000-000000000019',
  'authenticated',
  'authenticated',
  true,
  now(),
  now()
);
set local request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000019';

select lives_ok(
  $$select public.report_push_registration(
    'ios',
    'unavailable',
    'apns_token',
    'push/apns-token-unavailable',
    '1.0.0',
    '68'
  )$$,
  'an authenticated client can report a safe registration failure'
);
select is(
  (
    select status || ':' || stage || ':' || code
    from public.push_registration_health
    where user_id = 'd0000000-0000-0000-0000-000000000019'
  ),
  'unavailable:apns_token:push/apns-token-unavailable',
  'the failure remains remotely diagnosable without a device connection'
);

select public.register_push_token('ios', 'diagnostic-ios-token-aaaaaaaaaaaa');
update public.device_push_tokens
set invalidated_at = now(),
    last_delivery_error = 'FCM_404_UNREGISTERED'
where user_id = 'd0000000-0000-0000-0000-000000000019';

select is(
  public.push_token_status('diagnostic-ios-token-aaaaaaaaaaaa'),
  'invalidated',
  'the exact provider-rejected token remains identifiable'
);
select is(
  public.has_registered_push_token(),
  false,
  'an invalidated endpoint is not reported ready'
);

select public.register_push_token('ios', 'diagnostic-ios-token-aaaaaaaaaaaa');
select is(
  public.has_registered_push_token(),
  false,
  're-saving the same provider-rejected token does not reactivate it'
);
select public.register_push_token('ios', 'diagnostic-ios-token-bbbbbbbbbbbb');
select is(
  public.has_registered_push_token(),
  true,
  'a newly issued token restores an active endpoint'
);
select is(
  (
    select last_delivery_error
    from public.device_push_tokens
    where user_id = 'd0000000-0000-0000-0000-000000000019'
      and token = 'diagnostic-ios-token-bbbbbbbbbbbb'
  ),
  null,
  'a newly issued endpoint starts without a provider error'
);

select * from finish();
rollback;
