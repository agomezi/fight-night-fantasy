-- Fighter photos from API-Sports.
--
-- The card sync matches fighters to API-Sports once and records the match
-- here. A fighter already matched is never re-matched, so a photo, once set,
-- only changes by hand. An API-Sports id already held by another fighter is
-- skipped rather than failing the sync: that is a bad match, and no face is
-- better than the wrong one.

create function public.set_fighter_photos(photos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  photo   jsonb;
  updated integer := 0;
begin
  for photo in select * from jsonb_array_elements(photos) loop
    update public.fighters f
    set apisports_fighter_id = (photo->>'apisportsFighterId')::integer,
        photo_url            = photo->>'photoUrl'
    where f.ufc_fighter_id = photo->>'ufcFighterId'
      and f.apisports_fighter_id is null
      and f.photo_url is null
      and photo->>'photoUrl' ~ '^https://'
      and not exists (
        select 1 from public.fighters other
        where other.apisports_fighter_id = (photo->>'apisportsFighterId')::integer
      );
    if found then
      updated := updated + 1;
    end if;
  end loop;
  return updated;
end;
$$;

revoke execute on function public.set_fighter_photos(jsonb) from public, anon, authenticated;
grant execute on function public.set_fighter_photos(jsonb) to service_role;
