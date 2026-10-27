-- Fair rotation: in an odd league the leftover plays whoever has played the
-- fewest matchups, then met them the fewest times; even leagues pair exactly
-- as the circle method did. Weeks are saved when their card locks and never
-- move after; cards that locked before the rule keep the old pairing. Also
-- who can read and save the weeks, and Season 1's wipe.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000f1' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.lg(code text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000' || code)::uuid
$$;
create function pg_temp.ev(code text) returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'fr-' || code
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
-- The rule normally covers only cards that lock after the migration; these
-- tests move that moment.
create function pg_temp.rule_since(at timestamptz) returns void language plpgsql as $$
begin
  execute format('create or replace function public.league_rotation_since() returns timestamptz
    language sql immutable set search_path = '''' as $f$ select %L::timestamptz $f$', at);
end;
$$;
-- A league's members, joined a day apart in order.
create function pg_temp.league(code text, members int[]) returns void language sql as $$
  insert into public.leagues (id, name, owner_id, tier, created_at)
  values (pg_temp.lg(code), 'League ' || code, pg_temp.u(members[1]), 'pro', now() - interval '60 days');
  insert into public.league_members (league_id, user_id, joined_at)
  select pg_temp.lg(code), pg_temp.u(m), now() - interval '60 days' + i * interval '1 minute'
  from unnest(members) with ordinality x(m, i);
$$;
-- A week's matchups as join positions (0-based), smaller first.
create function pg_temp.positions(league uuid, season uuid, wk int) returns text language sql as $$
  select string_agg(least(pa, pb) || '-' || greatest(pa, pb), ',' order by least(pa, pb), greatest(pa, pb))
  from (
    select (select count(*) from public.league_members m, public.league_members me
            where m.league_id = league and me.league_id = league and me.user_id = s.user_a
              and (m.joined_at, m.user_id) < (me.joined_at, me.user_id)) as pa,
           (select count(*) from public.league_members m, public.league_members me
            where m.league_id = league and me.league_id = league and me.user_id = s.user_b
              and (m.joined_at, m.user_id) < (me.joined_at, me.user_id)) as pb
    from public.league_schedule(league, season) s where s.week = wk
  ) x;
$$;
create function pg_temp.circle(n int, wk int) returns text language sql as $$
  select string_agg(least(a, b) || '-' || greatest(a, b), ',' order by least(a, b), greatest(a, b))
  from public.circle_pairings(n, wk);
$$;

-- Only this file's cards.
delete from public.events;

insert into auth.users (id, email)
select pg_temp.u(n), 'fr' || n || '@example.test'
from (select generate_series(1, 9) union all select generate_series(11, 15)
      union all select generate_series(21, 27) union all select generate_series(31, 36)) g(n);

-------------------------------------------------------------------------------
-- The pre-season
-------------------------------------------------------------------------------

-- Five players in league a1; four in a2, who are outsiders to it.
select pg_temp.league('00a1', array[1, 2, 3, 4, 5]);
select pg_temp.league('00a2', array[6, 7, 8, 9]);
insert into public.events (ufc_event_id, name, starts_at, locks_at, status) values
  ('fr-p1', 'Pre One', now() - interval '20 days', now() - interval '20 days', 'complete'),
  ('fr-p2', 'Pre Two', now() - interval '13 days', now() - interval '13 days', 'complete'),
  ('fr-p3', 'Pre Three', now() + interval '2 days', now() + interval '2 days', 'scheduled');

select pg_temp.rule_since('-infinity');
select is(public.save_league_week_pairings(pg_temp.ev('p1')), 5,
  'saving a locked card saves every league''s week: three matchups for five players, two for four');
select is((select count(*)::int from public.league_weeks where league_id = pg_temp.lg('00a1') and doubleheader), 1,
  'with one doubleheader in the odd league');
select is(public.save_league_week_pairings(pg_temp.ev('p1')), 0, 'saving it again changes nothing');
select is(public.save_league_week_pairings(pg_temp.ev('p3')), 0, 'a card that hasn''t locked isn''t saved');

-- The upcoming week is worked out live, and is what the schedule shows.
select results_eq(
  $$select user_a, user_b from public.next_pairings(pg_temp.lg('00a1'), pg_temp.ev('p3')) order by 1, 2$$,
  $$select user_a, user_b from public.league_schedule(pg_temp.lg('00a1'), null) where event_id = pg_temp.ev('p3') order by 1, 2$$,
  'the schedule''s upcoming week is next_pairings');
select is((select count(*)::int from public.league_schedule(pg_temp.lg('00a1'), null)), 9,
  'three weeks of three matchups');

-- Before the rule took over, an unsaved locked card keeps the old pairing,
-- and a saved one keeps its saved week.
create temp table week1 as
  select user_a, user_b from public.league_weeks where league_id = pg_temp.lg('00a1') and event_id = pg_temp.ev('p1');
select pg_temp.rule_since('infinity');
select is(pg_temp.positions(pg_temp.lg('00a1'), null, 2), pg_temp.circle(5, 2),
  'a locked card with no saved week keeps the old pairing');
select results_eq(
  $$select user_a, user_b from public.league_schedule(pg_temp.lg('00a1'), null) where week = 1 order by 1, 2$$,
  $$select user_a, user_b from week1 order by 1, 2$$,
  'a saved week is read back as saved');
select pg_temp.rule_since('-infinity');

-- Reading the saved weeks.
set local role authenticated;
select pg_temp.act(2);
select is((select count(*)::int from public.league_weeks where league_id = pg_temp.lg('00a1')), 3,
  'a member reads their league''s weeks');
select is((select count(*)::int from public.league_weeks where league_id = pg_temp.lg('00a2')), 0,
  'and not another league''s');
select pg_temp.act(6);
select is((select count(*)::int from public.league_weeks where league_id = pg_temp.lg('00a1')), 0,
  'an outsider reads none of the league''s weeks');
select throws_ok($$select public.save_league_week_pairings(pg_temp.ev('p2'))$$, '42501', null,
  'a player can''t save a week');
select throws_ok($$insert into public.league_weeks (league_id, event_id, user_a, user_b)
  values (pg_temp.lg('00a2'), pg_temp.ev('p2'), pg_temp.u(6), pg_temp.u(7))$$, '42501', null,
  'or write one');
select throws_ok($$select * from public.next_pairings(pg_temp.lg('00a2'), pg_temp.ev('p3'))$$, '42501', null,
  'or call the internals');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.league_weeks$$, '42501', null, 'signed out reads nothing');
reset role;

-- Season 1 opens after the pre-season and wipes its weeks.
select pg_temp.rule_since('infinity');
insert into public.seasons (number, starts_at) values (1, now() - interval '5 days');
select is((select count(*)::int from public.league_weeks where season_id is null), 0,
  'Season 1 wipes the pre-season''s weeks');
delete from public.leagues where id in (pg_temp.lg('00a1'), pg_temp.lg('00a2'));

-------------------------------------------------------------------------------
-- A season
-------------------------------------------------------------------------------

-- Five, seven and six players. They join before the season, so they play it.
select pg_temp.league('00f5', array[11, 12, 13, 14, 15]);
select pg_temp.league('00f7', array[21, 22, 23, 24, 25, 26, 27]);
select pg_temp.league('00e6', array[31, 32, 33, 34, 35, 36]);
update public.league_members set status = 'active', active_from_season_id = public.current_season()
where league_id in (pg_temp.lg('00f5'), pg_temp.lg('00f7'), pg_temp.lg('00e6'));

-- Ten slotted cards, and an eleventh still to come.
insert into public.events (ufc_event_id, name, starts_at, locks_at, status, season_id, season_index)
select 'fr-s' || w, 'Season ' || w, now() - interval '4 days' + w * interval '1 hour',
       now() - interval '4 days' + w * interval '1 hour', 'complete', public.current_season(), w
from generate_series(1, 10) w;
insert into public.events (ufc_event_id, name, starts_at, locks_at, status)
values ('fr-s11', 'Season 11', now() + interval '1 day', now() + interval '1 day', 'scheduled');

-- Weeks 1-3 locked before the rule; 4 onwards after.
select pg_temp.rule_since(now() - interval '4 days' + interval '210 minutes');
select is(pg_temp.positions(pg_temp.lg('00f5'), public.current_season(), 3), pg_temp.circle(5, 3),
  'weeks played before the rule keep their old pairing');
select pg_temp.rule_since('-infinity');

select is(
  (select sum(public.save_league_week_pairings(pg_temp.ev('s' || w))) from generate_series(1, 3) w)::int,
  3 * (3 + 4 + 3), 'saving three weeks of three leagues');
create temp table f5_week3 as
  select user_a, user_b, doubleheader from public.league_weeks
  where league_id = pg_temp.lg('00f5') and event_id = pg_temp.ev('s3');
select is(
  (select sum(public.save_league_week_pairings(pg_temp.ev('s' || w))) from generate_series(4, 10) w)::int,
  7 * (3 + 4 + 3), 'and the next seven');

-- The eleventh locks: the saver slots it first, then saves it.
update public.events set locks_at = now() - interval '1 minute', starts_at = now() - interval '1 minute', status = 'live'
where id = pg_temp.ev('s11');
select is(public.save_locked_league_weeks(), 10, 'the cron saves the card that just locked');
select is((select season_index::int from public.events where id = pg_temp.ev('s11')), 11, 'in its slot');

-- A rescore and a roster change later.
update public.events set status = 'complete' where id = pg_temp.ev('s11');
insert into public.league_members (league_id, user_id, joined_at, status, active_from_season_id)
values (pg_temp.lg('00f5'), pg_temp.u(1), now(), 'active', public.current_season());
select is(public.save_league_week_pairings(pg_temp.ev('s3')), 0, 'resaving an old week saves nothing');
select results_eq(
  $$select user_a, user_b from public.league_schedule(pg_temp.lg('00f5'), public.current_season()) where week = 3 order by 1, 2$$,
  $$select user_a, user_b from f5_week3 order by 1, 2$$,
  'a saved week doesn''t move after later weeks, a rescore or a new member');
delete from public.league_members where league_id = pg_temp.lg('00f5') and user_id = pg_temp.u(1);

-- How often each pair met, and how many matchups each player had.
create function pg_temp.meetings(league uuid) returns table (lo int, hi int) language sql as $$
  with pairs as (
    select m1.user_id as x, m2.user_id as y from public.league_members m1
    join public.league_members m2 on m2.league_id = m1.league_id and m1.user_id < m2.user_id
    where m1.league_id = league
  ),
  met as (
    select p.x, p.y, (select count(*) from public.league_schedule(league, public.current_season()) s
                      where (s.user_a, s.user_b) in ((p.x, p.y), (p.y, p.x)))::int as n
    from pairs p
  )
  select min(n), max(n) from met;
$$;
create function pg_temp.games(league uuid) returns table (lo int, hi int) language sql as $$
  with g as (
    select m.user_id, (select count(*) from public.league_schedule(league, public.current_season()) s
                       where m.user_id in (s.user_a, s.user_b))::int as n
    from public.league_members m where m.league_id = league
  )
  select min(n), max(n) from g;
$$;

select is((select array[lo, hi] from pg_temp.meetings(pg_temp.lg('00f5'))), array[3, 4],
  'five players over eleven cards: every pair meets three or four times');
select ok((select hi - lo <= 1 from pg_temp.games(pg_temp.lg('00f5'))), 'and nobody plays more than one extra matchup');
select ok((select lo >= 1 and hi <= 3 from pg_temp.meetings(pg_temp.lg('00f7'))),
  'seven players: every pair meets one to three times');
select ok((select hi - lo <= 1 from pg_temp.games(pg_temp.lg('00f7'))), 'seven players: games within one');
select is(
  (select array_agg(pg_temp.positions(pg_temp.lg('00e6'), public.current_season(), w) order by w) from generate_series(1, 11) w),
  (select array_agg(pg_temp.circle(6, w) order by w) from generate_series(1, 11) w),
  'an even league pairs exactly as before');
select is((select count(*)::int from cron.job where jobname = 'league-weeks'), 1, 'the saver runs every minute');

select * from finish();
rollback;
