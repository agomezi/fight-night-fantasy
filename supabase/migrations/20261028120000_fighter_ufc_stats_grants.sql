-- Players read fighter histories with the card (as ufc_stats). The hosted
-- project doesn't grant new tables to the API roles by default, so without
-- this the whole card query is refused.

grant select on public.fighter_ufc_stats to anon, authenticated;
grant execute on function public.ufc_stats(public.fighters) to anon, authenticated;
grant execute on function public.fighter_name_key(text) to anon, authenticated;
