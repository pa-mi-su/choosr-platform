begin;
select plan(2);

select is(
  (select public from storage.buckets where id = 'discovery-images'),
  true,
  'discovery images are publicly readable by mobile clients'
);

select is(
  (select file_size_limit from storage.buckets where id = 'discovery-images'),
  2097152::bigint,
  'discovery images have a two-megabyte size limit'
);

select * from finish();
rollback;
