begin;
select plan(1);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notifications'
  ),
  'notification inbox publishes realtime changes'
);

select * from finish();
rollback;
