-- Award drops: a preview saves nothing, a run saves an unpublished drop,
-- publishing tells each player once, deleting undoes it. Each award goes to
-- who it should on a small fixture, under the minimum sample, and members
-- only read their league's drop.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Two final cards of five main card fights each.
create function pg_temp.card(ev text, days int) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', now() - make_interval(days => days),
    'status', 'complete', 'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', ev || o, 'order', o, 'segment', 'main',
        'scheduledRounds', 3, 'weightClass', null,
        'red', jsonb_build_object('ufcFighterId', ev || 'r' || o, 'name', 'Red ' || ev || o, 'nickname', null),
        'blue', jsonb_build_object('ufcFighterId', ev || 'b' || o, 'name', 'Blue ' || ev || o, 'nickname', null)))
      from generate_series(1, 5) o))
$$;
select public.sync_event_card(pg_temp.card('ad1', 2));
select public.sync_event_card(pg_temp.card('ad2', 1));
-- Red is the underdog everywhere and wins everywhere, by KO in round 2. (Set
-- straight in: the bouts have locked, which freezes the underdog.)
set local session_replication_role = replica;
update public.bouts set underdog_corner = 'red' where ufc_fight_id like 'ad%';
set local session_replication_role = origin;
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'KO', 2, 'ufc_live' from public.bouts b where b.ufc_fight_id like 'ad%';

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.lg() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000ad'::uuid $$;
insert into auth.users (id, email) select pg_temp.u(n), 'ad' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Awardee' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.lg(), 'Award League', pg_temp.u(1), 'pro', now() - interval '5 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.lg(), pg_temp.u(n), now() - interval '5 days' from generate_series(1, 4) n;

-- A pick and its score. `fights` are the orders picked on each card.
create function pg_temp.play(n int, fights int[], corner text, finish text, rnd int, meth text,
                             pts int, ok boolean, mpts int, rpts int)
returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
  select pg_temp.u(n), b.id, b.version, case corner when 'red' then b.red_fighter_id else b.blue_fighter_id end,
         finish::public.finish_kind, rnd, meth::public.pick_method
  from public.bouts b where b.ufc_fight_id like 'ad%' and b.fight_order = any (fights);
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, null, pts, pts,
         jsonb_build_object('fighter', case when ok then 50 else -50 end, 'method', mpts, 'round', rpts), ok, true
  from public.bouts b where b.ufc_fight_id like 'ad%' and b.fight_order = any (fights);
$$;

set local session_replication_role = replica;
-- 01: every fight, the underdog by KO in round 2, all right: a sniper, an
-- iron man, two perfect cards, the dog merchant, and the best call.
select pg_temp.play(1, array[1, 2, 3, 4, 5], 'red', 'round', 2, 'KO', 187, true, 50, 25);
-- 02: every fight, the favourite on decision, all wrong: the judge, chalk eater.
select pg_temp.play(2, array[1, 2, 3, 4, 5], 'blue', 'DEC', null, null, -80, false, -30, 0);
-- 03: four fights a card, the favourite by KO, wrong.
select pg_temp.play(3, array[1, 2, 3, 4], 'blue', 'ANY', null, 'KO', -50, false, -30, 0);
-- 04: one fight a card, the underdog to win: far fewer than everyone.
select pg_temp.play(4, array[1], 'red', 'ANY', null, null, 50, true, 0, 0);
set local session_replication_role = origin;

create function pg_temp.winners(a text) returns uuid[] language sql as $$
  select array_agg(user_id order by user_id) from public.drop_awards
  where award = a and scope = pg_temp.lg()::text and drop_id = (select id from public.award_drops where label = 'Check-in')
$$;

-------------------------------------------------------------------------------
-- Preview, run, publish, delete
-------------------------------------------------------------------------------

select ok((select count(*) from public.preview_award_drop('Check-in', 'checkin')) > 0, 'a preview lists the winners');
select is((select count(*)::int from public.award_drops), 0, 'and saves nothing');

create temp table dropped as select public.run_award_drop('Check-in', 'checkin') as id;
select is((select published_at from public.award_drops), null, 'a run saves the drop unpublished');
select is((select count(*)::int from public.notifications_sent where kind = 'awards'), 0, 'and tells nobody yet');
select throws_ok($$select public.run_award_drop('Check-in', 'checkin')$$, '23505', null, 'the same label can''t run twice');

-------------------------------------------------------------------------------
-- Who wins what, in the league
-------------------------------------------------------------------------------

select is(pg_temp.winners('finisher'), array[pg_temp.u(1)], 'the finisher calls finishes, more of them breaking a tie');
select is(pg_temp.winners('judge'), array[pg_temp.u(2)], 'the judge calls decisions');
select is(pg_temp.winners('chalk'), array[pg_temp.u(2)], 'the chalk eater backs favourites, the most of them');
select is(pg_temp.winners('dog'), array[pg_temp.u(1)], 'the dog merchant wins with underdogs');
select is(pg_temp.winners('sniper'), array[pg_temp.u(1)], 'the round sniper calls rounds right');
select is(pg_temp.winners('ice_cold'), array[pg_temp.u(1)], 'ice cold goes a whole card without a miss');
select is(pg_temp.winners('iron_man'), array[pg_temp.u(1), pg_temp.u(2)], 'iron man picks the most, ties sharing it');
select is(pg_temp.winners('call_of_night'), array[pg_temp.u(1)], 'the call of the night scored the most');
select is(pg_temp.winners('gun_shy'), array[pg_temp.u(4)], 'gun shy picks far fewer fights than everyone');
select ok(not (pg_temp.u(4) = any (coalesce(pg_temp.winners('sharpshooter'), '{}'))),
  'nobody wins a real award on fewer than 8 picks');
select is(pg_temp.winners('interim_champ'), (select array_agg(t.user_id) from public.league_table(pg_temp.lg()) t where t.rank = 1),
  'the league''s #1 is the interim champ at a check-in');

-------------------------------------------------------------------------------
-- Reading it
-------------------------------------------------------------------------------

select is(public.publish_award_drop((select id from dropped)), 4, 'publishing tells each player who played once, whatever their scopes');
select is(public.publish_award_drop((select id from dropped)), 0, 'and only once');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
select is((public.league_award_drop(pg_temp.lg()))->'drop'->>'label', 'Check-in', 'a member reads the league''s drop');
select ok(jsonb_array_length((public.league_award_drop(pg_temp.lg()))->'table') = 4
          and (public.league_award_drop(pg_temp.lg()))->'me' ? 'places', 'with the table and their own places');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(5), 'role', 'authenticated')::text, true);
select throws_ok($$select public.league_award_drop(pg_temp.lg())$$, 'P0001', null, 'nobody outside the league can');
reset role;

select public.delete_award_drop((select id from dropped));
select ok(not exists (select 1 from public.drop_awards) and not exists (select 1 from public.notifications_sent where kind = 'awards'),
  'deleting a drop takes its awards and notices with it');

select * from finish();
rollback;
