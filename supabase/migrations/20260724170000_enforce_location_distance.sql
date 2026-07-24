create or replace function private.enforce_session_location_distance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other public.session_locations%rowtype;
  v_distance_miles double precision;
begin
  select sl.* into v_other
  from public.session_locations sl
  where sl.session_id = new.session_id
    and sl.participant_id <> new.participant_id
  limit 1;

  if not found then
    return new;
  end if;

  v_distance_miles := 3958.8 * 2 * asin(
    least(
      1::double precision,
      sqrt(
        power(sin(radians(new.latitude - v_other.latitude) / 2), 2) +
        cos(radians(v_other.latitude)) *
        cos(radians(new.latitude)) *
        power(sin(radians(new.longitude - v_other.longitude) / 2), 2)
      )
    )
  );

  if v_distance_miles > 60 then
    raise exception using
      errcode = '22023',
      message = 'participant_locations_too_far';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_session_location_distance() from public;

create trigger enforce_session_location_distance
before insert or update of latitude, longitude on public.session_locations
for each row execute function private.enforce_session_location_distance();

comment on function private.enforce_session_location_distance() is
  'Rejects room-scoped participant locations more than 60 miles apart before the second location is stored.';
