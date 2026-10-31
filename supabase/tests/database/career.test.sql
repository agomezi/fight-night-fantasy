-- Career: the pro record (top half of the main card wins, the main event
-- breaks ties, level at the cut line draws), the career rank, and league
-- records kept past the season they were played in.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Order 1 is the main event and 2 the rest of the main card; 3 is a prelim.
create function pg_temp.card(ev text, starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', starts, 'status', 'scheduled',
    'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', ev || o, 'order', o,
        'segment', case when o <= 2 then 'main' else 'prelims' end, 'scheduledRounds', 3, 'weightClass', null,
        'red', jsonb_build_object('ufcFighterId', ev || 'r' || o, 'name', 'Red ' || ev || o, 'nickname', null),
        'blue', jsonb_build_object('ufcFighterId', ev || 'b' || o, 'name', 'Blue ' || ev || o, 'nickname', null)))
      from generate_series(1, 3) o))
$$;
select public.sync_event_card(pg_temp.card('cr1', now() - interval '20 days'));
select public.sync_event_card(pg_temp.card('cr2', now() - interval '13 days'));
select public.sync_event_card(pg_temp.card('cr3', now() - interval '6 days'));
select public.sync_event_card(pg_temp.card('cr4', now() + interval '30 days'));
select public.sync_event_card(pg_temp.card('cr5', now() + interval '37 days'));
select public.sync_event_card(pg_temp.card('cr6', now() + interval '44 days'));

create function pg_temp.ev(code text) returns uuid language sql as $$
  select id from public.events where ufc_event_id = code
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'cr' || n || '@example.test' from generate_series(1, 6) n;
update public.profiles set display_name = 'Career' || substring(id::text from 35);

-- Player n picks bout `o` of a card and scores `pts` on it. Run as the
-- owner, so the pick lock lets it through.
create function pg_temp.play(n int, code text, o int, pts int) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'DEC'
  from public.bouts b where b.event_id = pg_temp.ev(code) and b.fight_order = o;
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, e.season_id, pts, pts, '{}'::jsonb, pts > 0, true
  from public.bouts b join public.events e on e.id = b.event_id
  where b.event_id = pg_temp.ev(code) and b.fight_order = o;
$$;
-- Every bout gets a result with the given status, and the card is over.
create function pg_temp.finish(code text, st public.result_status default 'final') returns void language sql as $$
  insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
  select b.id, st, b.red_fighter_id, 'DEC', null, 'ufc_live'
  from public.bouts b where b.event_id = pg_temp.ev(code)
  on conflict (bout_id) do update set status = excluded.status;
  update public.events set status = 'complete' where id = pg_temp.ev(code);
$$;
create function pg_temp.settle(code text) returns void language sql as $$
  select public.settle_event(pg_temp.ev(code));
$$;
create function pg_temp.results(code text) returns table (n int, result text) language sql as $$
  select substring(c.user_id::text from 35)::int, c.result from public.card_results c
  where c.event_id = pg_temp.ev(code) order by 1
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;

-------------------------------------------------------------------------------
-- The pro record
-------------------------------------------------------------------------------

-- cr1, main card points (main event):
--   1  100 (50)   2  50 (50)   3  50 (-50)   4  -100 (-50), plus 300 on a prelim
--   5  picked only bout 2, for 200
select pg_temp.play(1, 'cr1', 1, 50), pg_temp.play(1, 'cr1', 2, 50);
select pg_temp.play(2, 'cr1', 1, 50), pg_temp.play(2, 'cr1', 2, 0);
select pg_temp.play(3, 'cr1', 1, -50), pg_temp.play(3, 'cr1', 2, 100);
select pg_temp.play(4, 'cr1', 1, -50), pg_temp.play(4, 'cr1', 2, -50), pg_temp.play(4, 'cr1', 3, 300);
select pg_temp.play(5, 'cr1', 2, 200);

select pg_temp.settle('cr1');
select is_empty($$select * from public.card_results$$, 'a card still being fought settles nothing');

select pg_temp.finish('cr1', 'provisional');
select pg_temp.settle('cr1');
select is_empty($$select * from public.card_results$$, 'nor does one whose results are provisional');

select pg_temp.finish('cr1');
delete from public.results where bout_id = (select id from public.bouts where ufc_fight_id = 'cr13');
select pg_temp.settle('cr1');
select is_empty($$select * from public.card_results$$, 'nor one with a bout still waiting on a result');

select pg_temp.finish('cr1');
select pg_temp.settle('cr1');
select results_eq($$select * from pg_temp.results('cr1')$$,
  $$values (1, 'W'), (2, 'W'), (3, 'L'), (4, 'L')$$,
  'the top half of the main card win; prelims don''t count and no main event pick is no fight');
select is((select field from public.card_results where user_id = pg_temp.u(2) and event_id = pg_temp.ev('cr1')), 4,
  'the field is everyone who picked the main event');
select is((select main_event_points from public.card_results where user_id = pg_temp.u(2) and event_id = pg_temp.ev('cr1')), 50,
  '2 and 3 tie at the cut on points; 2''s main event puts them through');

-- 4's main event pick was made before the opponent changed, so it's void.
update public.scores set counts_for_accuracy = false
where user_id = pg_temp.u(4) and bout_id = (select id from public.bouts where ufc_fight_id = 'cr11');
select pg_temp.settle('cr1');
select results_eq($$select * from pg_temp.results('cr1')$$,
  $$values (1, 'W'), (2, 'W'), (3, 'L')$$,
  'a voided main event pick is no fight');
update public.scores set counts_for_accuracy = true
where user_id = pg_temp.u(4) and bout_id = (select id from public.bouts where ufc_fight_id = 'cr11');
select pg_temp.settle('cr1');

-- cr2: 2 and 3 are level on points and main event at the cut line.
select pg_temp.play(1, 'cr2', 1, 50), pg_temp.play(1, 'cr2', 2, 50);
select pg_temp.play(2, 'cr2', 1, 0), pg_temp.play(2, 'cr2', 2, 50);
select pg_temp.play(3, 'cr2', 1, 0), pg_temp.play(3, 'cr2', 2, 50);
select pg_temp.play(4, 'cr2', 1, -50), pg_temp.play(4, 'cr2', 2, -50);
select pg_temp.finish('cr2');
select pg_temp.settle('cr2');
select results_eq($$select * from pg_temp.results('cr2')$$,
  $$values (1, 'W'), (2, 'D'), (3, 'D'), (4, 'L')$$,
  'players level on both at the cut line draw');

-- cr3: an odd field. The middle player wins.
select pg_temp.play(1, 'cr3', 1, -50);
select pg_temp.play(2, 'cr3', 1, 0);
select pg_temp.play(4, 'cr3', 1, 50);
select pg_temp.finish('cr3');
select pg_temp.settle('cr3');
select results_eq($$select * from pg_temp.results('cr3')$$,
  $$values (1, 'L'), (2, 'W'), (4, 'W')$$,
  'an odd field''s middle player wins');

-- Two players are too few.
delete from public.picks where user_id = pg_temp.u(4) and bout_id in (select id from public.bouts where event_id = pg_temp.ev('cr3'));
select pg_temp.settle('cr3');
select is_empty($$select * from pg_temp.results('cr3')$$, 'a card needs three players to count');

-- A card that stops being final loses its results, and gets them back.
update public.events set status = 'live' where id = pg_temp.ev('cr2');
select pg_temp.settle('cr2');
select is_empty($$select * from pg_temp.results('cr2')$$, 'a card no longer final loses its results');
update public.events set status = 'complete' where id = pg_temp.ev('cr2');
select pg_temp.settle('cr2');
select is((select count(*)::int from pg_temp.results('cr2')), 4, 'and settles again once it is');

-------------------------------------------------------------------------------
-- Reading your career
-------------------------------------------------------------------------------

select pg_temp.act(1);
set local role authenticated;
select results_eq($$select wins, losses, draws, cards, streak, career_points, rank, next_rank, next_at from public.my_career()$$,
  $$values (2, 0, 0, 2, 2, 4, 'Prospect', 'Contender', 5)$$,
  'two wins from two cards: four career points, a win streak of 2');
select pg_temp.act(2);
select results_eq($$select wins, draws, streak from public.my_career()$$, $$values (1, 1, 0)$$,
  'a draw ends a streak');
select pg_temp.act(4);
select results_eq($$select losses, streak from public.my_career()$$, $$values (2, -2)$$,
  'losses in a row count down');
select pg_temp.act(6);
select results_eq($$select cards, streak, career_points, rank from public.my_career()$$, $$values (0, 0, 0, 'Prospect')$$,
  'a new player is a Prospect with no record');
reset role;

-- Player 1 wins one more card: five points, Contender.
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
values (pg_temp.ev('cr4'), pg_temp.u(1), 0, 0, 3, 'L');
select pg_temp.act(1);
set local role authenticated;
select results_eq($$select career_points, rank, next_rank, next_at, streak from public.my_career()$$,
  $$values (5, 'Contender', 'Ranked', 15, -1)$$,
  'five career points is Contender; the newest card sets the streak');
reset role;
delete from public.card_results where event_id = pg_temp.ev('cr4');

select results_eq($$select public.career_rank_for(p) from unnest(array[34, 35, 74, 75, 154, 155]) p$$,
  $$values ('Ranked'), ('Title Challenger'), ('Title Challenger'), ('Champion'), ('Champion'), ('Legend')$$,
  'each rank takes twice the points of the one before');

-- Player 1 wins 36 more cards: 76 points, Champion, with Legend at 155.
with climb as (
  insert into public.events (ufc_event_id, name, starts_at, locks_at, status)
  select 'climb' || g, 'Climb ' || g, now() - (400 - g) * interval '1 day', now() - (400 - g) * interval '1 day', 'complete'
  from generate_series(1, 36) g
  returning id
)
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
select c.id, pg_temp.u(1), 0, 0, 3, 'W' from climb c;
select pg_temp.act(1);
set local role authenticated;
select results_eq($$select career_points, rank, next_rank, next_at from public.my_career()$$,
  $$values (76, 'Champion', 'Legend', 155)$$,
  'Champion starts at 75 and Legend at 155');
reset role;
delete from public.card_results where event_id in (select id from public.events where ufc_event_id like 'climb%');
delete from public.events where ufc_event_id like 'climb%';

select throws_ok($$select * from public.my_career()$$, '42501', null, 'anon can''t read careers')
  from (select set_config('role', 'anon', true)) r;
reset role;

-------------------------------------------------------------------------------
-- League records
-------------------------------------------------------------------------------

-- A Pro league of 1-4, made before the cards above.
create temporary table ids (k text primary key, id uuid);
grant all on ids to authenticated;
select pg_temp.act(1);
set local role authenticated;
insert into ids values ('L', public.create_league('Career League', 'pro'));
reset role;
update public.leagues set created_at = now() - interval '30 days' where id = (select id from ids where k = 'L');
create function pg_temp.lg() returns uuid language sql as $$ select id from ids where k = 'L' $$;
create function pg_temp.join(n int) returns void language plpgsql as $$
declare
  code text := (select invite_code from public.leagues where id = pg_temp.lg());
begin
  perform pg_temp.act(n);
  set local role authenticated;
  perform public.join_league(code);
  reset role;
end;
$$;
select pg_temp.join(2), pg_temp.join(3), pg_temp.join(4);
update public.league_members set joined_at = now() - interval '30 days' where league_id = pg_temp.lg();

select pg_temp.settle('cr1'), pg_temp.settle('cr2'), pg_temp.settle('cr3');

-- What was kept matches the live schedule's finished matchups.
create function pg_temp.live_finals() returns table (event_id uuid, user_a uuid, user_b uuid, winner uuid)
language sql as $$
  select s.event_id, s.user_a, s.user_b, s.winner from public.league_schedule(pg_temp.lg(), public.current_season()) s
  where s.state = 'final' and s.user_b is not null and public.event_is_final(s.event_id)
  order by 1, 2, 3
$$;
select ok((select count(*) from pg_temp.live_finals()) > 0, 'the pre-season has finished matchups');
select results_eq(
  $$select event_id, user_a, user_b, winner from public.league_results where league_id = pg_temp.lg() order by 1, 2, 3$$,
  $$select * from pg_temp.live_finals()$$,
  'every finished pre-season matchup is kept as it was played');

select pg_temp.act(1);
set local role authenticated;
select results_eq(
  $$select season_wins, season_losses, season_draws, wins, losses, draws from public.my_league_records()$$,
  $$select wins, losses, draws, wins, losses, draws from public.league_standings(pg_temp.lg()) where is_me$$,
  'your league record matches the standings');
select results_eq(
  $$select season from public.league_record_history(pg_temp.lg(), pg_temp.u(2))$$,
  $$values (0)$$,
  'a league mate''s history, the pre-season as season 0');
select throws_ok($$select public.settle_event(pg_temp.ev('cr1'))$$, '42501', null, 'players can''t settle cards');
select pg_temp.act(5);
select is_empty($$select * from public.league_record_history(pg_temp.lg(), pg_temp.u(2))$$,
  'someone outside the league sees nothing');
reset role;

-------------------------------------------------------------------------------
-- Season 1 wipes the pre-season
-------------------------------------------------------------------------------

insert into public.seasons (number, starts_at) values (1, now() - interval '3 days');
select is_empty($$select * from public.card_results$$, 'Season 1 wipes the pre-season pro records');
select is_empty($$select * from public.league_results$$, 'and the pre-season league results');
select pg_temp.settle('cr1');
select is_empty($$select * from public.card_results$$, 'and a pre-season card can''t settle again');

-------------------------------------------------------------------------------
-- A season's records outlive it
-------------------------------------------------------------------------------

select public.sync_event_card(pg_temp.card('cs1', now() - interval '1 day'));
select public.assign_season_slots();
select pg_temp.play(n, 'cs1', o, case when n = 1 then 50 else (n - 2) * 10 end)
from generate_series(1, 4) n, generate_series(1, 3) o;
-- 5 tops the card, then deletes their account.
select pg_temp.play(5, 'cs1', o, 500) from generate_series(1, 3) o;
update public.profiles set deleted_at = now(), display_name = null where id = pg_temp.u(5);
select pg_temp.finish('cs1');

set local role service_role;
select lives_ok($$select public.settle_event((select id from public.events where ufc_event_id = 'cs1'))$$,
  'the results sync can settle a card');
reset role;
select is((select count(*)::int from public.card_results where event_id = pg_temp.ev('cs1')), 4,
  'a season card counts, without the deleted account in the field');
select is((select count(distinct season_id)::int from public.league_results), 1, 'its league results are kept under the season');

-- A card of the current season going back to live clears its league results.
update public.events set status = 'live' where id = pg_temp.ev('cs1');
select pg_temp.settle('cs1');
select is_empty($$select * from public.league_results$$, 'a season card no longer final loses its league results');
update public.events set status = 'complete' where id = pg_temp.ev('cs1');
select pg_temp.settle('cs1');
select ok(exists (select 1 from public.league_results), 'and keeps them again once it is');

create temporary table season1 as
  select user_a, user_b, winner from public.league_results where league_id = pg_temp.lg() order by 1, 2;
grant select on season1 to authenticated;

-- 4 leaves mid-season; Season 2 opens, which purges them from the league.
select pg_temp.act(4);
set local role authenticated;
select public.leave_league(pg_temp.lg());
reset role;
-- Nothing saved yet: the season opening has to keep it all by itself.
delete from public.league_results;
delete from public.card_results where event_id = pg_temp.ev('cs1');
insert into public.seasons (number, starts_at) values (2, now());
select is((select count(*)::int from public.league_members where league_id = pg_temp.lg() and user_id = pg_temp.u(4)), 0,
  'the season opening drops the player who left');
select results_eq($$select user_a, user_b, winner from public.league_results where league_id = pg_temp.lg() order by 1, 2$$,
  $$select * from season1 order by 1, 2$$,
  'but the season opening kept every finished Season 1 matchup, theirs included');
select is((select count(*)::int from public.card_results where event_id = pg_temp.ev('cs1')), 4,
  'and settled the card''s pro records');

-- A past season's card that stops being final keeps its league results:
-- that season's rotation is gone.
update public.events set status = 'live' where id = pg_temp.ev('cs1');
select pg_temp.settle('cs1');
select results_eq($$select user_a, user_b, winner from public.league_results where league_id = pg_temp.lg() order by 1, 2$$,
  $$select * from season1 order by 1, 2$$,
  'a past season''s league results stay put');
update public.events set status = 'complete' where id = pg_temp.ev('cs1');
select pg_temp.settle('cs1');

select pg_temp.act(1);
set local role authenticated;
select results_eq(
  $$select season_wins + season_losses + season_draws, wins + losses + draws from public.my_league_records()$$,
  $$values (0, (select count(*)::int from season1 where pg_temp.u(1) in (user_a, user_b)))$$,
  'a new season starts at 0-0 while all-time keeps the last one');
select results_eq($$select season from public.league_record_history(pg_temp.lg(), pg_temp.u(1))$$, $$values (1)$$,
  'history lists Season 1');
reset role;

select * from finish();
rollback;
