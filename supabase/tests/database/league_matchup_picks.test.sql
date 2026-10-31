-- Any matchup's picks: league members can look at any head-to-head on a card,
-- and each side shows as its section locks, both sides alike, unless that side
-- is you. Players outside the league, pairs that don't face each other and
-- signed-out callers get nothing.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Order 1 is the main event, 2 a prelim. Opened in the future so the picks
-- can be saved; the locks are set after.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lm1', 'name', 'Card lm1', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'lm1' || o, 'order', o,
      'segment', case o when 1 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'lm1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'lm1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 2) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000003' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'lm1' $$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'lm1' || o $$;
create function pg_temp.gym() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000003aa'::uuid $$;
create function pg_temp.act(n uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated')::text, true);
$$;

-- 01-04 in a Pro league made before the card; 05 in no league.
insert into auth.users (id, email) select pg_temp.u(n), 'lm' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Looker' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.gym(), 'Gym League', pg_temp.u(1), 'pro', now() - interval '3 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.gym(), pg_temp.u(n), now() - interval '3 days' from generate_series(1, 4) n;

-- Everyone picks red on both fights.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'round', 2, 'KO'
from public.bouts b cross join generate_series(1, 4) n
where b.event_id = pg_temp.ev();

-- The prelims started an hour ago; the main card is an hour away.
update public.bouts set locks_at = case fight_order when 1 then now() + interval '1 hour' else now() - interval '1 hour' end
where event_id = pg_temp.ev();
update public.events set locks_at = now() - interval '1 hour', status = 'live' where id = pg_temp.ev();

-- The two matchups this week: one is 01's, the other two players face each
-- other.
create temp table pairs as
select s.user_a as a, s.user_b as b, pg_temp.u(1) in (s.user_a, s.user_b) as mine
from public.league_schedule(pg_temp.gym(), null) s
where s.event_id = pg_temp.ev();
grant select on pairs to authenticated;
create function pg_temp.other(side text) returns uuid language sql as $$
  select case side when 'a' then p.a else p.b end from pairs p where not p.mine
$$;
create function pg_temp.mine(side text) returns uuid language sql as $$
  select case side when 'a' then p.a else p.b end from pairs p where p.mine
$$;
create function pg_temp.row(o int) returns record language sql as $$
  select (m.a_shown, m.a_fighter is not null, m.b_shown, m.b_fighter is not null)
  from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m
  where m.fight_order = o
$$;

select is((select count(*)::int from pairs), 2, 'the fixture has two matchups');

-------------------------------------------------------------------------------
-- Who can look
-------------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act(pg_temp.u(5));
select throws_ok($$select * from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b'))$$,
  'P0001', null, 'someone outside the league can''t look');

select pg_temp.act(pg_temp.u(1));
select throws_ok($$select * from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.mine('a'), pg_temp.other('a'))$$,
  'P0001', 'Those players don''t face each other on that card.', 'nor can a member look at two players who don''t face each other');
select throws_ok($$select * from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.u(5))$$,
  'P0001', null, 'or at a player outside the league');
select throws_ok($$select * from public.league_matchup_picks(pg_temp.gym(), gen_random_uuid(), pg_temp.other('a'), pg_temp.other('b'))$$,
  'P0001', null, 'or at a card the league didn''t play');
select lives_ok($$select * from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('b'), pg_temp.other('a'))$$,
  'either order works');

-------------------------------------------------------------------------------
-- What a third member sees
-------------------------------------------------------------------------------

select is(pg_temp.row(1)::text, '(f,f,f,f)', 'neither side''s main event pick shows before the main card starts');
select is(pg_temp.row(2)::text, '(t,t,t,t)', 'both sides'' prelim picks show once the prelims have started');
select is((select (m.a_finish, m.a_round, m.a_method)::text
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m
           where m.fight_order = 2),
  '(round,2,KO)', 'with the method and round');
select ok((select bool_and(m.a_locked_in and m.b_locked_in)
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m),
  'and whether each side is locked in shows before anything does');

-------------------------------------------------------------------------------
-- What a player in the matchup sees
-------------------------------------------------------------------------------

select pg_temp.act(pg_temp.other('a'));
select is((select (m.a_shown, m.a_fighter is not null, m.b_shown, m.b_fighter is not null)::text
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m
           where m.fight_order = 1),
  '(t,t,f,f)', 'your own side always shows, your opponent''s main event pick doesn''t yet');
select pg_temp.act(pg_temp.other('b'));
select is((select (m.a_shown, m.a_fighter is not null, m.b_shown, m.b_fighter is not null)::text
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m
           where m.fight_order = 1),
  '(f,f,t,t)', 'whichever side you are');

-------------------------------------------------------------------------------
-- The main card starts
-------------------------------------------------------------------------------

reset role;
update public.bouts set locks_at = now() - interval '1 minute' where id = pg_temp.bid(1);
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select p, pg_temp.bid(2), null, 40, 20, '{}'::jsonb, true, true from unnest(array[pg_temp.other('a'), pg_temp.other('b')]) p;
set local role authenticated;
select pg_temp.act(pg_temp.u(1));

select is(pg_temp.row(1)::text, '(t,t,t,t)', 'both main event picks show once the main card starts');
select is((select (m.a_points, m.b_points)::text
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m
           where m.fight_order = 2),
  '(40,40)', 'with the points they scored');

reset role;
-- The tier the card is played at.
update public.league_tiers set tier = 'casual' where league_id = pg_temp.gym();
set local role authenticated;
select pg_temp.act(pg_temp.u(1));
select is((select array_agg(m.fight_order)
           from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b')) m),
  array[1::smallint], 'only the bouts the league''s tier plays are listed');

reset role;
set local role anon;
select throws_ok($$select * from public.league_matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.other('a'), pg_temp.other('b'))$$,
  '42501', null, 'signed-out callers can''t call it');

select * from finish();
rollback;
