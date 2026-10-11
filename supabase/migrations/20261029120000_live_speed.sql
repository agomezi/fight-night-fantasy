-- Faster live results.
--
-- The results sync now runs every 10 seconds instead of 30. It only calls out
-- while a card is due (invoke_results_sync returns early otherwise), and
-- sync-results itself now asks to be read again in 10 seconds for as long as
-- a card is live, so this costs a few thousand calls on a fight night and
-- nothing in between.
--
-- And the app hears about new scores and results the moment they're written
-- (Supabase Realtime), instead of on its next minute's refresh. Realtime
-- follows the tables' row level security: a player hears only their own
-- scores, and results are public.

select cron.unschedule('results-sync');
select cron.schedule('results-sync', '10 seconds', $$select public.invoke_results_sync()$$);

alter publication supabase_realtime add table public.scores, public.results;
