-- A head-to-head's picks: yours always show, your opponent's only once their
-- bout has locked, and before that only whether they're locked in. Only league
-- members can look, at players in the same league.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Order 1 is the main event, 2 a prelim, 3 an early prelim. Every section
-- opens in the future so the picks can be saved; the locks are set after.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'mk1', 'name', 'Card mk1', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'mk1' || o, 'order', o,
      'segment', case o when 1 then 'main' when 2 then 'prelims' else 'early_prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'mk1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'mk1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 3) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'mk1'
$$;
create function pg_temp.bid(o int) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = 'mk1' || o
$$;
create function pg_temp.gym() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;

-- 01 and 02 face each other in a Pro league with 04; 03 is in another league.
insert into auth.users (id, email) select pg_temp.u(n), 'mk' || n || '@example.test' from generate_series(1, 4) n;
insert into public.leagues (id, name, owner_id, tier)
values (pg_temp.gym(), 'Gym League', pg_temp.u(1), 'pro'),
       ('00000000-0000-0000-0000-0000000000bb', 'Other League', pg_temp.u(3), 'pro');
insert into public.league_members (league_id, user_id)
select pg_temp.gym(), pg_temp.u(n) from unnest(array[1, 2, 4]) n
union all
select '00000000-0000-0000-0000-0000000000bb'::uuid, pg_temp.u(3);

-- 01 picks red everywhere, 02 blue everywhere; 04 picks nothing.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
select pg_temp.u(n), b.id, b.version, case n when 1 then b.red_fighter_id else b.blue_fighter_id end,
       'round', 2, 'KO'
from public.bouts b cross join unnest(array[1, 2]) n
where b.event_id = pg_temp.ev();

-- The early prelims and prelims have started; the main card is an hour away.
update public.bouts set locks_at = case fight_order when 1 then now() + interval '1 hour' else now() - interval '1 hour' end
where event_id = pg_temp.ev();
update public.events set locks_at = now() - interval '1 hour' where id = pg_temp.ev();

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.theirs(opp int, o int) returns uuid language sql as $$
  select m.their_fighter from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(opp)) m where m.fight_order = o
$$;
create function pg_temp.blue(o int) returns uuid language sql as $$
  select blue_fighter_id from public.bouts where id = pg_temp.bid(o)
$$;

-------------------------------------------------------------------------------
-- Who can look
-------------------------------------------------------------------------------

set local role authenticated;

select pg_temp.act(3);
select throws_ok($$select * from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2))$$,
  'P0001', null, 'someone outside the league can''t look');

select pg_temp.act(1);
select throws_ok($$select * from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(3))$$,
  'P0001', null, 'nor can a member look at a player outside it');

-------------------------------------------------------------------------------
-- What shows
-------------------------------------------------------------------------------

select is((select count(*)::int from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2)) m where m.my_fighter is not null),
  3, 'your own picks always show');
select is(pg_temp.theirs(2, 1), null, 'their main event pick stays hidden until the main card starts');
select is(pg_temp.theirs(2, 2), pg_temp.blue(2), 'their prelim pick shows once the prelims have started');
select is((select (m.their_finish, m.their_round, m.their_method)::text
           from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2)) m where m.fight_order = 3),
  '(round,2,KO)', 'with its method and round');
select ok((select bool_and(m.their_locked_in) from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2)) m),
  'and whether they''re locked in shows before anything does');
select ok((select not bool_or(m.their_locked_in) from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(4)) m),
  'someone with no main event pick isn''t locked in');
select is(pg_temp.theirs(4, 2), null, 'and has nothing to show');

reset role;
-- 02's prelim pick scored; a pick made before a fighter was replaced no longer applies.
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
values (pg_temp.u(2), pg_temp.bid(2), null, 40, 20, '{}'::jsonb, true, true);
update public.bouts set version = version + 1 where id = pg_temp.bid(3);
-- The main card starts.
update public.bouts set locks_at = now() - interval '1 minute' where id = pg_temp.bid(1);
set local role authenticated;
select pg_temp.act(1);

select is(pg_temp.theirs(2, 1), pg_temp.blue(1), 'their main event pick shows once the main card starts');
select is((select m.their_points from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2)) m where m.fight_order = 2),
  40, 'with the points it scored');
select is(pg_temp.theirs(2, 3), null, 'a pick on a bout that changed since doesn''t show');

reset role;
-- Casual plays only the main card, and at casual points.
-- The tier the card is played at.
update public.league_tiers set tier = 'casual' where league_id = pg_temp.gym();
set local role authenticated;
select pg_temp.act(1);
select is((select array_agg(m.fight_order) from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2)) m),
  array[1::smallint], 'only the bouts the league''s tier plays are listed');

reset role;
set local role anon;
select throws_ok($$select * from public.matchup_picks(pg_temp.gym(), pg_temp.ev(), pg_temp.u(2))$$,
  '42501', null, 'signed-out callers can''t call it');

select * from finish();
rollback;
