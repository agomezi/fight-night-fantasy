-- Fighter photos run on their own schedule rather than inside the daily card
-- sync. API-Sports' free plan allows 10 requests a minute and 100 a day, so a
-- photo run spaces its requests out (about 105 seconds for its cap of 15) and
-- runs every 4 hours: at most 90 requests a day, and none once every
-- fighter on the stored cards has a photo or has been looked for recently.

-- When a name search last failed to find this fighter. Debut fighters often
-- are not in API-Sports yet; without this, every run would search for them
-- again and spend the budget before reaching later cards.
alter table public.fighters add column photo_checked_at timestamptz;

create function public.mark_photo_checked(ufc_fighter_ids text[])
returns integer
language sql
set search_path = ''
as $$
  with checked as (
    update public.fighters set photo_checked_at = now()
    where ufc_fighter_id = any (ufc_fighter_ids) and photo_url is null
    returning 1
  )
  select count(*)::integer from checked;
$$;

revoke execute on function public.mark_photo_checked(text[]) from public, anon, authenticated;
grant execute on function public.mark_photo_checked(text[]) to service_role;

select cron.schedule('card-sync-photos', '20 */4 * * *', $$select public.invoke_card_sync('photos')$$);
