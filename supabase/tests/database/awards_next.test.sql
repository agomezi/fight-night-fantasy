-- The Oracle, Iron Chin, and a league's table read from its saved weeks: void
-- and unsettled takes don't count, The Oracle needs 5 takes and more takes
-- break a tie, a league's Oracle is among its members, Iron Chin needs a run
-- of 3, and the Champ stays put when a card is rescored after its week was
-- saved or a player leaves.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Three final cards of five main card fights each; red wins everything.
create function pg_temp.card(ev text, days int) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', now() - make_interval(days => days),
    'status', 'complete', 'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', ev || o, 'order', o, 'segment', 'main',
        'scheduledRounds', 3, 'weightClass', null,
        'red', jsonb_build_object('ufcFighterId', ev || 'r' || o, 'name', 'Red ' || ev || o, 'nickname', null),
        'blue', jsonb_build_object('ufcFighterId', ev || 'b' || o, 'name', 'Blue ' || ev || o, 'nickname', null)))
      from generate_series(1, 5) o))
$$;
select public.sync_event_card(pg_temp.card('an1', 3));
select public.sync_event_card(pg_temp.card('an2', 2));
select public.sync_event_card(pg_temp.card('an3', 1));
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'KO', 2, 'ufc_live' from public.bouts b where b.ufc_fight_id like 'an%';

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000b00' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.lg() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b0'::uuid $$;
insert into auth.users (id, email) select pg_temp.u(n), 'an' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Chin' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.lg(), 'Chin League', pg_temp.u(1), 'pro', now() - interval '5 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.lg(), pg_temp.u(n), now() - interval '5 days' from generate_series(1, 4) n;
-- An odd league of all five, where someone plays twice on a card.
create function pg_temp.odd() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000b1'::uuid $$;
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.odd(), 'Odd League', pg_temp.u(1), 'pro', now() - interval '5 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.odd(), pg_temp.u(n), now() - interval '5 days' from generate_series(1, 5) n;

-- Everyone picks every fight; `pts` a fight decides who wins each week:
-- 01 beats everyone, then 02, 03, 04. 05 is outside the league.
create function pg_temp.play(n int, pts int) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY'::public.finish_kind
  from public.bouts b where b.ufc_fight_id like 'an%';
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, null, pts, pts, jsonb_build_object('fighter', 50, 'method', 0, 'round', 0), true, true
  from public.bouts b where b.ufc_fight_id like 'an%';
$$;
set local session_replication_role = replica;
select pg_temp.play(1, 40), pg_temp.play(2, 30), pg_temp.play(3, 20), pg_temp.play(4, 10), pg_temp.play(5, 0);
set local session_replication_role = origin;

-- Each week saved as it went final, except the last card's: its sync failed.
select public.settle_event(e.event_id) from (select distinct event_id from public.bouts where ufc_fight_id like 'an%') e;
delete from public.league_results where event_id = (select event_id from public.bouts where ufc_fight_id = 'an31');

-- Takes on the first card: 12 settled 'yes', one voided, one not settled yet.
insert into public.community_polls (event_id, kind, slug, question, answer)
select (select event_id from public.bouts where ufc_fight_id = 'an11'), 'hot_take', 'an-take-' || n, 'Take ' || n,
       case when n <= 12 then 'yes' when n = 13 then 'void' end
from generate_series(1, 14) n;
create function pg_temp.vote(u int, takes int[], choice text) returns void language sql as $$
  insert into public.poll_votes (poll_id, user_id, option)
  select p.id, pg_temp.u(u), choice from public.community_polls p
  where p.slug = any (select 'an-take-' || t from unnest(takes) t)
$$;
-- 01: 5 of 6, plus the void and the unsettled one wrong.
select pg_temp.vote(1, array[1, 2, 3, 4, 5], 'yes'), pg_temp.vote(1, array[6, 13, 14], 'no');
-- 02: 10 of 12, the same rate on more takes.
select pg_temp.vote(2, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'yes'), pg_temp.vote(2, array[11, 12], 'no');
-- 03: 4 of 4, too few.
select pg_temp.vote(3, array[1, 2, 3, 4], 'yes');
-- 04: 4 of 4, plus the void and the unsettled one right: still 4.
select pg_temp.vote(4, array[1, 2, 3, 4, 13, 14], 'yes');
-- 05: 12 of 12, but not in the league.
select pg_temp.vote(5, array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'yes');

create function pg_temp.winners(drop_label text, a text, sc text default pg_temp.lg()::text) returns uuid[] language sql as $$
  select array_agg(user_id order by user_id) from public.drop_awards
  where award = a and scope = sc and drop_id = (select id from public.award_drops where label = drop_label)
$$;
create function pg_temp.stat(drop_label text, n int, k text, sc text default pg_temp.lg()::text) returns text language sql as $$
  select s.stats->>k from public.drop_stats s
  where s.user_id = pg_temp.u(n) and s.scope = sc and s.drop_id = (select id from public.award_drops where label = drop_label)
$$;

select public.run_award_drop('Check-in', 'checkin');

-------------------------------------------------------------------------------
-- The Oracle
-------------------------------------------------------------------------------

select is(pg_temp.stat('Check-in', 4, 'takes'), '4', 'voided and unsettled takes don''t count');
select is(pg_temp.stat('Check-in', 1, 'takes_right'), '5', 'right calls are counted');
select is(pg_temp.winners('Check-in', 'oracle'), array[pg_temp.u(2)], 'the same hit rate goes to more takes');
select ok(not (pg_temp.u(3) = any (coalesce(pg_temp.winners('Check-in', 'oracle'), '{}'))),
  'nobody is The Oracle on fewer than 5 takes, however right');
select is(pg_temp.winners('Check-in', 'oracle', 'global'), array[pg_temp.u(5)], 'globally, the best of everyone');
select is((select round(value, 3) from public.drop_awards where award = 'oracle' and scope = pg_temp.lg()::text),
  0.833, 'its value is the hit rate');
select ok((pg_temp.stat('Check-in', 2, 'places')::jsonb ? 'oracle'), 'and it counts as a real award in your places');

-------------------------------------------------------------------------------
-- Iron Chin and the table
-------------------------------------------------------------------------------

select is(pg_temp.stat('Check-in', 1, 'unbeaten_run'), '3', 'three wins in a row is a run of 3');
select is(pg_temp.winners('Check-in', 'iron_chin'), array[pg_temp.u(1)], 'Iron Chin goes to the longest unbeaten run');
select ok(pg_temp.stat('Check-in', 2, 'unbeaten_run')::int < 3, 'a loss ends a run');
select ok(exists (select 1 from public.league_results where event_id = (select event_id from public.bouts where ufc_fight_id = 'an31')),
  'a final card whose weeks weren''t saved is saved before the drop reads them');
select ok(exists (select 1 from public.league_results r where r.league_id = pg_temp.odd()
                  group by r.event_id, r.user_a having count(*) > 1)
          or exists (select 1 from public.league_results r where r.league_id = pg_temp.odd()
                     group by r.event_id, r.user_b having count(*) > 1),
  'the odd league has a doubleheader');
select is((select count(*)::int from public.drop_stats s
           where s.scope = pg_temp.odd()::text and s.drop_id = (select id from public.award_drops where label = 'Check-in')
             and (s.stats->>'league_points')::int
                 <> (select sum(x.points) from public.scores x join public.bouts b on b.id = x.bout_id
                     where x.user_id = s.user_id and b.ufc_fight_id like 'an%')),
  0, 'a doubleheader counts its card''s points once');
select is(pg_temp.stat('Check-in', 1, 'wins') || '-' || pg_temp.stat('Check-in', 1, 'losses') || ' #' || pg_temp.stat('Check-in', 1, 'rank'),
  '3-0 #1', 'the table comes from the saved weeks');
select is(pg_temp.winners('Check-in', 'interim_champ'), array[pg_temp.u(1)], 'and so does the interim champ');

-------------------------------------------------------------------------------
-- After a rescore and someone leaving
-------------------------------------------------------------------------------

-- Every card rescored the other way round, the weeks already saved, and 03
-- leaves.
set local session_replication_role = replica;
update public.scores s set points = x.n * 10, casual_points = x.n * 10
from generate_series(1, 4) x(n), public.bouts b
where s.user_id = pg_temp.u(x.n) and b.id = s.bout_id and b.ufc_fight_id like 'an%';
set local session_replication_role = origin;
update public.league_members set left_at = now() where league_id = pg_temp.lg() and user_id = pg_temp.u(3);

select public.run_award_drop('Midseason', 'midseason');

select isnt((select t.user_id from public.league_table(pg_temp.lg()) t where t.rank = 1), pg_temp.u(1),
  'the live table now has someone else on top');
select is(pg_temp.winners('Midseason', 'interim_champ'), array[pg_temp.u(1)], 'the champ comes from the weeks as they were saved');
select ok(pg_temp.stat('Midseason', 3, 'rank') is null and pg_temp.stat('Midseason', 3, 'wins') = '1',
  'a player who left keeps their record but isn''t ranked');

-------------------------------------------------------------------------------
-- Reading it
-------------------------------------------------------------------------------

select public.publish_award_drop((select id from public.award_drops where label = 'Midseason'));
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
select ok(exists (select 1 from jsonb_array_elements(public.league_award_drop(pg_temp.lg())->'awards') a
                  where a->>'award' = 'oracle' and a->>'userId' = pg_temp.u(2)::text),
  'a member reads The Oracle in the league''s drop');
select ok(exists (select 1 from jsonb_array_elements(public.league_award_drop(pg_temp.lg())->'table') r
                  where r->>'userId' = pg_temp.u(1)::text and r->>'rank' = '1' and r->>'wins' = '3'),
  'with the table from the saved weeks');
reset role;

select * from finish();
rollback;
