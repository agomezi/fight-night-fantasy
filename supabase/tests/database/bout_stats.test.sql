-- Live fight stats: stored only when changed, official never replaced by
-- unofficial, corners lined up to our bout, the right fights due for a read,
-- and readable by players only through bout_stats() and stats_bouts(). Runs
-- with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.b(n integer) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', 'bs1' || n, 'order', n, 'segment', 'main', 'scheduledRounds', 3,
    'weightClass', null, 'red', pg_temp.f('bsr' || n), 'blue', pg_temp.f('bsb' || n))
$$;
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'bs1', 'name', 'Stats Card', 'startsAt', now() - interval '1 hour', 'status', 'live',
  'issues', '[]'::jsonb, 'bouts', (select jsonb_agg(pg_temp.b(n)) from generate_series(1, 9) n)));

-- Parsed stats in fightStats.ts's shape, trimmed to what the SQL reads.
create function pg_temp.stats(fight text, red text, blue text, sig integer, official boolean) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'official', official, 'liveRound', 2, 'liveClock', '3:14',
    'red', jsonb_build_object('ufcFighterId', red, 'sig', jsonb_build_array(sig, sig * 2)),
    'blue', jsonb_build_object('ufcFighterId', blue, 'sig', jsonb_build_array(1, 2)),
    'rounds', jsonb_build_array(
      jsonb_build_object('round', 2, 'red', jsonb_build_object('ufcFighterId', red), 'blue', jsonb_build_object('ufcFighterId', blue)),
      jsonb_build_object('round', 1, 'red', jsonb_build_object('ufcFighterId', red), 'blue', jsonb_build_object('ufcFighterId', blue))))
$$;
create function pg_temp.bout(fight text) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = fight
$$;
create function pg_temp.event() returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'bs1'
$$;

-- Results: 13 and 16–19 finished, 14 cancelled, 15 lost a fighter.
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'KO', 1, 'ufc_live'
from public.bouts b where b.ufc_fight_id in ('bs13', 'bs16', 'bs17', 'bs18', 'bs19');
insert into public.results (bout_id, status, void_reason, source)
values (pg_temp.bout('bs14'), 'final', 'CANCELLED', 'ufc_live'),
       (pg_temp.bout('bs15'), 'final', 'FIGHTER_CHANGED', 'ufc_live');

-- Writes, as the results sync
set local role service_role;
select ok(public.record_bout_stats(pg_temp.stats('bs11', 'bsr1', 'bsb1', 5, false)), 'first stats are stored');
select ok(not public.record_bout_stats(pg_temp.stats('bs11', 'bsr1', 'bsb1', 5, false)), 'the same stats are not rewritten');
select ok(public.record_bout_stats(pg_temp.stats('bs11', 'bsr1', 'bsb1', 9, false)), 'new numbers are stored');
select ok(public.record_bout_stats(pg_temp.stats('bs11', 'bsr1', 'bsb1', 12, true)), 'official numbers are stored');
select ok(not public.record_bout_stats(pg_temp.stats('bs11', 'bsr1', 'bsb1', 3, false)), 'unofficial numbers never replace official ones');
select ok(not public.record_bout_stats(pg_temp.stats('nope', 'x', 'y', 1, false)), 'an unknown fight is skipped');
select lives_ok($$select public.stats_due(pg_temp.event())$$, 'the sync can ask what is due');
reset role;

-- Reads
select is(public.bout_stats(pg_temp.bout('bs11'))->'red'->'sig', '[12, 24]'::jsonb, 'reads the stored numbers');
select is(public.bout_stats(pg_temp.bout('bs11'))->'live', 'false'::jsonb, 'not live while another fight is on');
select is(public.bout_stats(pg_temp.bout('bs11'))->'round', 'null'::jsonb, 'no live round when not live');
select is(jsonb_path_query_array(public.bout_stats(pg_temp.bout('bs11')), '$.rounds[*].round'), '[1, 2]'::jsonb, 'rounds in order');
select is(public.bout_stats(pg_temp.bout('bs13')), null, 'no stats yet reads as null');

-- Feed corners swapped against ours: numbers follow the fighter.
select public.record_bout_stats(pg_temp.stats('bs12', 'bsb2', 'bsr2', 7, false));
update public.events set live_bout_id = pg_temp.bout('bs12') where ufc_event_id = 'bs1';
select is(public.bout_stats(pg_temp.bout('bs12'))->'blue'->'sig', '[7, 14]'::jsonb, 'swapped corners follow the fighter');
select is(public.bout_stats(pg_temp.bout('bs12'))->'rounds'->0->'red'->>'ufcFighterId', 'bsr2', 'rounds swap too');
select is(public.bout_stats(pg_temp.bout('bs12'))->>'clock', '3:14', 'the live clock while in the cage');

-- Stats for a different pairing (a late replacement) are never shown.
select public.record_bout_stats(pg_temp.stats('bs13', 'bsr3', 'someone-else', 4, false));
select is(public.bout_stats(pg_temp.bout('bs13')), null, 'stats for another pairing read as null');

select is(public.stats_bouts(pg_temp.event()) @> array[pg_temp.bout('bs11'), pg_temp.bout('bs12')], true,
  'stats_bouts lists bouts with stats');
select is(cardinality(public.stats_bouts(pg_temp.event())), 2, 'and nothing else: not another pairing, not a bout without stats');

-- Due: the live fight first, then up to four finished fights without official
-- stats, in card order.
select is(public.stats_due(pg_temp.event()), array['bs12', 'bs13', 'bs16', 'bs17', 'bs18'],
  'the live fight, then four finished ones');
select ok(not ('bs11' = any(public.stats_due(pg_temp.event()))), 'official stats are not due');
select ok(not ('bs14' = any(public.stats_due(pg_temp.event()))), 'a cancelled fight is not due');
select ok(not ('bs15' = any(public.stats_due(pg_temp.event()))), 'a fight that lost a fighter is not due');
select ok(not ('bs19' = any(public.stats_due(pg_temp.event()))), 'past four, the rest wait for the next run');
update public.events set starts_at = now() - interval '4 days', locks_at = now() - interval '4 days' where ufc_event_id = 'bs1';
select is(public.stats_due(pg_temp.event()), array['bs12'], 'three days on, only a live fight is read');

-- Access
set local role authenticated;
select throws_ok($$select * from public.bout_stats$$, '42501', null, 'players cannot read the table directly');
select throws_ok($$select public.record_bout_stats('{}'::jsonb)$$, '42501', null, 'players cannot write stats');
select is(public.bout_stats(pg_temp.bout('bs11'))->'red'->'sig', '[12, 24]'::jsonb, 'players read stats through bout_stats()');
select is(cardinality(public.stats_bouts(pg_temp.event())), 2, 'players can call stats_bouts()');
reset role;

select * from finish();
rollback;
