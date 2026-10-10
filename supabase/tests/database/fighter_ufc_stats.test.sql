-- Fighter UFC stats: the loaded history is found by name whatever the accents,
-- our own results after it are added on, a no contest neither counts nor ends
-- a streak, a draw or a loss ends it, fights before the history's date aren't
-- counted twice, and only the loader can change the history.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function pg_temp.fid(ufc text) returns uuid language sql as $$
  select id from public.fighters where ufc_fighter_id = ufc
$$;
create function pg_temp.stats(ufc text) returns public.fighter_ufc_stats language sql as $$
  select s.* from public.fighters f, public.ufc_stats(f) s where f.ufc_fighter_id = ufc
$$;

-- A card with one bout per pairing, on `day` (evening in New York).
create function pg_temp.card(id text, day date, pairs text[][]) returns void language sql as $$
  select public.sync_event_card(jsonb_build_object(
    'ufcEventId', id, 'name', 'Card ' || id,
    'startsAt', (day + time '20:00') at time zone 'America/New_York', 'status', 'scheduled',
    'issues', '[]'::jsonb,
    'bouts', (select jsonb_agg(jsonb_build_object(
        'ufcFightId', id || i, 'order', i, 'segment', 'main', 'scheduledRounds', 3, 'weightClass', 'Lightweight',
        'red', jsonb_build_object('ufcFighterId', pairs[i][1], 'name', pairs[i][1], 'nickname', null),
        'blue', jsonb_build_object('ufcFighterId', pairs[i][2], 'name', pairs[i][2], 'nickname', null)))
      from generate_subscripts(pairs, 1) i)));
$$;
create function pg_temp.result(fight text, winner text, method public.result_method, void public.void_reason default null)
returns void language sql as $$
  insert into public.results (bout_id, status, winner_fighter_id, method, round, source, void_reason)
  select b.id, 'final', pg_temp.fid(winner), method,
         case when method in ('KO', 'SUB') then 1 end, 'ufc_live', void
  from public.bouts b where b.ufc_fight_id = fight;
$$;

-- History to 2026-10-03: Jiri is on a 2-fight streak.
select results_eq(
  $$select loaded, upcoming, matched from public.load_fighter_stats('[
      {"name": "Jiri Prochazka", "wins": 6, "losses": 2, "koWins": 5, "subWins": 1, "decWins": 0, "winStreak": 2, "lastFight": "2026-06-14"},
      {"name": "Old Timer", "wins": 1, "losses": 0, "koWins": 0, "subWins": 0, "decWins": 1, "winStreak": 1, "lastFight": "2010-01-01"},
      {"name": "Old  Timer", "wins": 9, "losses": 0, "koWins": 9, "subWins": 0, "decWins": 0, "winStreak": 9, "lastFight": "2001-01-01"}
    ]'::jsonb, '2026-10-03')$$,
  $$values (2, 0, 0)$$,
  'two fighters with the same name keep the one who fought last');

-- Card sync names him with his accents.
select pg_temp.card('c0', '2026-10-03', array[['Jiří Procházka', 'Opp Zero']]);
update public.fighters set name = 'Jiří Procházka' where ufc_fighter_id = 'Jiří Procházka';
select pg_temp.result('c01', 'Jiří Procházka', 'KO');

select results_eq($$select wins, ko_wins, win_streak from pg_temp.stats('Jiří Procházka')$$, $$values (6::smallint, 5::smallint, 2::smallint)$$,
  'the history is found despite the accents, and a fight on its last day isn''t counted twice');

-- After the history: a KO win, then a no contest, then a submission win.
select pg_temp.card('c1', '2026-10-17', array[['Jiří Procházka', 'Opp One']]);
select pg_temp.result('c11', 'Jiří Procházka', 'KO');
select pg_temp.card('c2', '2026-11-14', array[['Jiří Procházka', 'Opp Two']]);
select pg_temp.result('c21', null, null, 'NC');
select pg_temp.card('c3', '2026-12-12', array[['Jiří Procházka', 'Opp Three']]);
select pg_temp.result('c31', 'Jiří Procházka', 'SUB');

select results_eq(
  $$select wins, losses, ko_wins, sub_wins, dec_wins, win_streak, last_fight from pg_temp.stats('Jiří Procházka')$$,
  $$values (8::smallint, 2::smallint, 6::smallint, 2::smallint, 0::smallint, 4::smallint, '2026-12-12'::date)$$,
  'our results add on, and a no contest neither counts nor ends the streak');

-- A loss ends the streak; a win after it starts a new one.
select pg_temp.card('c4', '2027-01-16', array[['Jiří Procházka', 'Opp Four']]);
select pg_temp.result('c41', 'Opp Four', 'DEC');
select results_eq($$select losses, win_streak from pg_temp.stats('Jiří Procházka')$$, $$values (3::smallint, 0::smallint)$$,
  'a loss ends the streak');
select pg_temp.card('c5', '2027-02-13', array[['Jiří Procházka', 'Opp Five']]);
select pg_temp.result('c51', 'Jiří Procházka', 'DEC');
select results_eq($$select wins, dec_wins, win_streak from pg_temp.stats('Jiří Procházka')$$, $$values (9::smallint, 1::smallint, 1::smallint)$$,
  'a win after it starts a new one');

-- A draw ends a streak without counting as a loss.
select pg_temp.card('c6', '2027-03-13', array[['Jiří Procházka', 'Opp Six']]);
select pg_temp.result('c61', null, null, 'DRAW');
select results_eq($$select wins, losses, win_streak from pg_temp.stats('Jiří Procházka')$$, $$values (9::smallint, 3::smallint, 0::smallint)$$,
  'a draw ends the streak without counting as a loss');

-- A newcomer the history doesn't know is counted from our results alone.
select results_eq($$select wins, losses, win_streak from pg_temp.stats('Opp Four')$$, $$values (1::smallint, 0::smallint, 1::smallint)$$,
  'a newcomer is counted from our results');
select is((select count(*)::int from public.fighters f, public.ufc_stats(f) s where f.ufc_fighter_id = 'Opp Zero'), 0,
  'and someone with no fights after the history and no history has no stats');

-- Unfought bouts don't count.
select pg_temp.card('c7', '2027-04-10', array[['Opp One', 'Opp Two']]);
select pg_temp.result('c71', null, null, 'CANCELLED');
select is((select count(*)::int from public.fighters f, public.ufc_stats(f) s where f.ufc_fighter_id = 'Opp Two'), 1,
  'a cancelled bout isn''t a fight');
select results_eq($$select wins, losses from pg_temp.stats('Opp Two')$$, $$values (0::smallint, 0::smallint)$$,
  'so Opp Two has only his no contest');

-- Players can read the history but not change it.
set local role authenticated;
select ok((select count(*) from public.fighter_ufc_stats) > 0, 'players can read the history');
select throws_ok($$select public.load_fighter_stats('[]'::jsonb, '2026-10-03')$$, '42501', null, 'but not load it');
reset role;

select * from finish();
rollback;
