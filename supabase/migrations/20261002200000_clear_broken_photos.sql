-- API-Sports returns a photo URL even for fighters it has no image for, and
-- those URLs 404. The photo run now checks an image exists before saving it,
-- and clears any stored API-Sports photo that has stopped loading. A cleared
-- fighter is marked checked, so it is looked for again after a week, by
-- which time API-Sports may have the image.
--
-- Only photos the sync set (API-Sports media URLs) are cleared; one set by
-- hand is left alone.
create function public.clear_broken_photos(ufc_fighter_ids text[])
returns integer
language sql
set search_path = ''
as $$
  with cleared as (
    update public.fighters
    set photo_url = null, apisports_fighter_id = null, photo_checked_at = now()
    where ufc_fighter_id = any (ufc_fighter_ids)
      and photo_url like 'https://media.api-sports.io/%'
    returning 1
  )
  select count(*)::integer from cleared;
$$;

revoke execute on function public.clear_broken_photos(text[]) from public, anon, authenticated;
grant execute on function public.clear_broken_photos(text[]) to service_role;
