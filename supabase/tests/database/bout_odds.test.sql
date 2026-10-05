-- Bout odds: the odds sync sets each open bout's underdog from its moneyline,
-- the underdog freezes when the bout locks, a fighter swap clears a stale
-- price, and runs are spaced to fit the monthly quota.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select is(public.underdog_of(-142, 120), 'blue'::public.corner, 'the plus-money side is the underdog');
select is(public.underdog_of(130, -155), 'red'::public.corner, 'whichever corner it is in');
select is(public.underdog_of(-108, -112), 'red'::public.corner, 'the smaller favourite is the underdog when both are minus');
select is(public.underdog_of(-110, -110), null, 'a pick''em has no underdog');

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.bout(fight text, ord int, seg text, locks timestamptz, blue text default null) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'order', ord, 'segment', seg, 'scheduledRounds', 3,
    'weightClass', null, 'red', pg_temp.f('r' || fight), 'blue', pg_temp.f(coalesce(blue, 'b' || fight)), 'locksAt', locks)
$$;
-- Early prelims started an hour ago; prelims in an hour; main card in three.
create function pg_temp.card(main_blue text default null) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', 'od', 'name', 'Odds Card', 'startsAt', now() - interval '1 hour', 'status', 'live',
    'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
      pg_temp.bout('od1', 1, 'main', now() + interval '3 hours', main_blue),
      pg_temp.bout('od2', 2, 'prelims', now() + interval '1 hour'),
      pg_temp.bout('od3', 3, 'early_prelims', now() - interval '1 hour')))
$$;
create function pg_temp.b(fight text) returns public.bouts language sql as $$
  select * from public.bouts where ufc_fight_id = fight
$$;
create function pg_temp.odds(fight text, red int, blue int) returns jsonb language sql as $$
  select jsonb_build_object('boutId', (pg_temp.b(fight)).id, 'redOdds', red, 'blueOdds', blue)
$$;

-- No earlier run, and nothing else in the next two weeks, may decide this.
delete from public.odds_syncs;
update public.bouts set status = 'cancelled' where status = 'scheduled';

set local role service_role;
select public.sync_event_card(pg_temp.card());

select is((select count(*) from public.bouts_for_odds()), 2::bigint, 'only bouts still open to picks are priced');
select ok(public.odds_sync_due(), 'a card with no run yet is due');

select is(
  public.record_odds(jsonb_build_array(pg_temp.odds('od1', -142, 120), pg_temp.odds('od2', 225, -278), pg_temp.odds('od3', 150, -180)),
    '{"matched": 3}'::jsonb, 498),
  2, 'the open bouts are updated and the locked one is skipped');
select is(((pg_temp.b('od1')).red_odds, (pg_temp.b('od1')).blue_odds), (-142, 120), 'the line is stored in our corners');
select is((pg_temp.b('od1')).underdog_corner, 'blue'::public.corner, 'and the underdog with it');
select is((pg_temp.b('od3')).underdog_corner, null, 'a bout that had locked is not given one');
select is((select (credits_remaining, report->>'updated') from public.odds_syncs), (498, '2'::text), 'the run is logged');
select ok(not public.odds_sync_due(), 'a run in the last two hours before a lock is enough');

select public.record_odds(jsonb_build_array(pg_temp.odds('od1', 110, -130)), '{}'::jsonb, 497);
select is((pg_temp.b('od1')).underdog_corner, 'red'::public.corner, 'the underdog follows the line until the lock');

-- A substitution on the main card before it locks.
select public.sync_event_card(pg_temp.card('sub'));
select is(((pg_temp.b('od1')).red_odds, (pg_temp.b('od1')).underdog_corner), (null::integer, null::public.corner),
  'new fighters clear the old pairing''s price');
reset role;

-- The prelims lock; the bout keeps the underdog it had.
select public.record_odds(jsonb_build_array(pg_temp.odds('od2', 225, -278)), '{}'::jsonb, 496);
update public.bouts set locks_at = now() - interval '1 minute' where ufc_fight_id = 'od2';
select throws_ok($$update public.bouts set underdog_corner = 'blue' where ufc_fight_id = 'od2'$$,
  'P0001', null, 'a locked bout''s underdog cannot change');
select is((pg_temp.b('od2')).underdog_corner, 'red'::public.corner, 'it stays what it was at the lock');
set local role service_role;
select lives_ok($$select public.sync_event_card(pg_temp.card('sub'))$$, 'the card sync still runs over a locked bout');
reset role;

-- A section locking in ten minutes, with the last run half an hour ago: one
-- more run takes a fresh price before the freeze.
update public.odds_syncs set ran_at = now() - interval '30 minutes';
update public.bouts set locks_at = now() + interval '10 minutes' where ufc_fight_id = 'od1';
select ok(public.odds_sync_due(), 'a run is due just before a section locks');

set local role authenticated;
select throws_ok($$select public.record_odds('[]'::jsonb, '{}'::jsonb, 0)$$, '42501', null, 'players cannot write odds');
select throws_ok($$select * from public.odds_syncs$$, '42501', null, 'or read the run log');
reset role;

select * from finish();
rollback;
