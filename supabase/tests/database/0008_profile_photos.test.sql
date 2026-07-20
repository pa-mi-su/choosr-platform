begin;
select plan(6);

select has_column('public', 'profiles', 'avatar_path', 'profiles have an avatar path');
select has_function('public', 'set_profile_avatar', array['text']);
select is(
  (select public from storage.buckets where id = 'profile-photos'),
  true,
  'profile photo bucket serves Circle avatars'
);

insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
values ('80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', true, now(), now());
set local request.jwt.claim.sub = '80000000-0000-0000-0000-000000000001';
select * from public.upsert_choosr_profile('Photo User', 'photo_user');

select lives_ok(
  $$select public.set_profile_avatar('80000000-0000-0000-0000-000000000001/avatar-123.jpg')$$,
  'a user can attach an owned profile photo path'
);
select is(
  (select avatar_path from public.profiles where user_id = '80000000-0000-0000-0000-000000000001'),
  '80000000-0000-0000-0000-000000000001/avatar-123.jpg',
  'the avatar path is persisted'
);
select throws_ok(
  $$select public.set_profile_avatar('80000000-0000-0000-0000-000000000099/avatar-456.jpg')$$,
  '22023',
  'invalid_avatar_path',
  'a profile cannot claim another user path'
);

select * from finish();
rollback;
