-- League pushes during a card: lead changes in head-to-heads (the first lead
-- only noted, ties keep the leader, at most two a night, none about a blocked
-- player or in a matchup a missing pick has decided, none once final), and
-- where you stand as the main card starts (once, ranked leagues only).
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Order 1 is the main event, 2 and 3 prelims. Opened in the future so picks
-- can be saved; the locks move into the past below.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lp1', 'name', 'UFC Fight Night: Lp vs. One', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'lp1' || o, 'order', o,
      'segment', case o when 1 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'lp1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'lp1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 3) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'lp1' $$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'lp1' || o $$;
create function pg_temp.gym() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;

-- 01-04 in a Pro league made before the card; 05 in no league.
insert into auth.users (id, email) select pg_temp.u(n), 'lp' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Player' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.gym(), 'Gym League', pg_temp.u(1), 'pro', now() - interval '3 hours');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.gym(), pg_temp.u(n), now() - interval '3 hours' from generate_series(1, 4) n;

-- Everyone but 03 picks the main event; 05 picks it too.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY'
from public.bouts b cross join unnest(array[1, 2, 4, 5]) n
where b.id = pg_temp.bid(1);

-- Prelims started an hour ago, the main card five minutes ago.
update public.bouts set locks_at = case fight_order when 1 then now() - interval '5 minutes' else now() - interval '1 hour' end
where event_id = pg_temp.ev();
update public.events set locks_at = now() - interval '1 hour', status = 'live' where id = pg_temp.ev();

-- 01's opponent this week, and 03's.
create function pg_temp.opp(n int) returns uuid language sql as $$
  select case when s.user_a = pg_temp.u(n) then s.user_b else s.user_a end
  from public.league_schedule(pg_temp.gym(), null) s
  where s.event_id = pg_temp.ev() and pg_temp.u(n) in (s.user_a, s.user_b)
$$;
-- Sets a player's points on a bout.
create function pg_temp.score(who uuid, o int, pts int) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy, provisional)
  values (who, pg_temp.bid(o), null, pts, pts, '{}'::jsonb, pts > 0, true, false)
  on conflict (user_id, bout_id) do update set points = excluded.points, casual_points = excluded.casual_points,
    computed_at = clock_timestamp()
$$;
create function pg_temp.claim() returns setof jsonb language sql as $$
  select jsonb_build_object('to', c.user_id, 'lead', c.payload->'lead', 'mine', c.payload->'mine',
    'theirs', c.payload->'theirs', 'opponent', c.payload->'opponent', 'wanted', c.wanted)
  from public.claim_matchup_notifications(pg_temp.ev()) c
$$;

select isnt(pg_temp.opp(1), pg_temp.u(3), 'the fixture pairs 01 with someone who picked the main event');

-------------------------------------------------------------------------------
-- Lead changes
-------------------------------------------------------------------------------

select pg_temp.score(pg_temp.u(1), 2, 10);
select is((select count(*)::int from pg_temp.claim()), 0, 'the first lead of the night sends nothing');
select is((select leader from public.matchup_leads where pg_temp.u(1) in (user_a, user_b)), pg_temp.u(1), 'but is noted');
select is((select count(*)::int from pg_temp.claim()), 0, 'and nothing runs again until a score changes');

-- 01 has league activity turned off: still claimed, not pushed.
update public.profiles set notify_league_activity = false where id = pg_temp.u(1);
select pg_temp.score(pg_temp.opp(1), 2, 30);
create temp table sent1 as select * from pg_temp.claim() j;
update public.profiles set notify_league_activity = true where id = pg_temp.u(1);
select is((select count(*)::int from sent1), 2, 'a lead change tells both sides');
select is((select j->>'lead' from sent1 j where (j->>'to')::uuid = pg_temp.opp(1)), 'true', 'the new leader that they passed');
select is((select (j->>'mine') || '-' || (j->>'theirs') from sent1 j where (j->>'to')::uuid = pg_temp.u(1)),
  '10-30', 'and the other side the score from where they stand');
select is((select j->>'opponent' from sent1 j where (j->>'to')::uuid = pg_temp.u(1)),
  (select display_name from public.profiles where id = pg_temp.opp(1)), 'naming the opponent');
select is((select count(*)::int from public.notifications_sent where kind = 'matchup'), 2, 'both land in the inbox');
select is((select array_agg((j->>'wanted')::boolean order by (j->>'to')::uuid = pg_temp.u(1)) from sent1 j),
  array[true, false], 'the league activity toggle decides whether each is pushed');

select pg_temp.score(pg_temp.u(1), 3, 20);
select is((select count(*)::int from pg_temp.claim()), 0, 'drawing level sends nothing');

-- 01 blocks their opponent, then retakes the lead.
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(1), pg_temp.opp(1));
select pg_temp.score(pg_temp.u(1), 3, 25);
create temp table sent2 as select * from pg_temp.claim() j;
select is((select count(*)::int from sent2), 1, 'the lead changing back sends again');
select is((select (j->>'to')::uuid from sent2 j), pg_temp.opp(1), 'but not to someone who blocked the other player');

delete from public.player_blocks;
select pg_temp.score(pg_temp.opp(1), 3, 40);
select is((select count(*)::int from pg_temp.claim()), 0, 'a third change in one night sends nothing');
select is((select flips from public.matchup_leads where pg_temp.u(1) in (user_a, user_b)), 3, 'though it is still counted');

-- 03 never picked the main event, so their matchup is already decided.
select pg_temp.score(pg_temp.u(3), 2, 50);
select pg_temp.score(pg_temp.opp(3), 2, 5);
select pg_temp.claim();
select pg_temp.score(pg_temp.opp(3), 3, 80);
select is((select count(*)::int from pg_temp.claim()), 0, 'a matchup a missing pick decided sends nothing');
select is((select count(*)::int from public.matchup_leads where pg_temp.u(3) in (user_a, user_b)), 0, 'nor is noted');


-- Once the card is final, a late change sends nothing.
update public.events set status = 'complete' where id = pg_temp.ev();
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'DEC', null, 'ufc_live' from public.bouts b where b.event_id = pg_temp.ev()
on conflict do nothing;
select pg_temp.score(pg_temp.u(1), 1, 300);
select is((select count(*)::int from pg_temp.claim()), 0, 'nothing once the card is final');
update public.events set status = 'live' where id = pg_temp.ev();

-------------------------------------------------------------------------------
-- Main card start
-------------------------------------------------------------------------------

create temp table ranks as select * from public.claim_standing_notifications();
select is((select count(*)::int from ranks), 3, 'everyone ranked with a pick hears where they stand');
select ok(not exists (select 1 from ranks where user_id in (pg_temp.u(3), pg_temp.u(5))),
  'not someone with no pick, nor someone in no league');
select is((select payload->'leagues'->0->>'league' from ranks where user_id = pg_temp.u(1)), 'Gym League', 'naming the league');
select is((select (payload->'leagues'->0->>'rank')::int from ranks where user_id = pg_temp.u(1)),
  (select t.rank::int from public.league_table(pg_temp.gym()) t where t.user_id = pg_temp.u(1)), 'with their rank in its table');
select is((select count(*)::int from public.claim_standing_notifications()), 0, 'once a card');

-------------------------------------------------------------------------------
-- Standings are unchanged for members, and still members only
-------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select is((select array_agg(s.user_id order by s.user_id) from public.league_standings(pg_temp.gym()) s),
  (select array_agg(pg_temp.u(n) order by pg_temp.u(n)) from generate_series(1, 4) n), 'members still see the table');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(5), 'role', 'authenticated')::text, true);
select throws_ok($$select * from public.league_standings(pg_temp.gym())$$, 'P0001', null, 'and others still can''t');

select * from finish();
rollback;
