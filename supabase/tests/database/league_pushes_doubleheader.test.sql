-- League pushes in an odd league's doubleheader week, where one player has
-- two matchups on the card, and after a void deletes scores. Also who may
-- call the internals.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- One bout, the main event, opened in the future so picks can be saved.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'dh1', 'name', 'UFC Fight Night: Dh vs. One', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'dh11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 5, 'weightClass', null,
    'red', jsonb_build_object('ufcFighterId', 'dh1r', 'name', 'Red One', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'dh1b', 'name', 'Blue One', 'nickname', null)))));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'dh1' $$;
create function pg_temp.bout() returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'dh11' $$;
create function pg_temp.lg() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000dd'::uuid $$;

-- Five players in a Pro league, every one with a main event pick.
insert into auth.users (id, email) select pg_temp.u(n), 'dh' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Doubler' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.lg(), 'Odd League', pg_temp.u(1), 'pro', now() - interval '3 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.lg(), pg_temp.u(n), now() - interval '3 days' from generate_series(1, 5) n;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY' from public.bouts b cross join generate_series(1, 5) n
where b.id = pg_temp.bout();
update public.bouts set locks_at = now() - interval '1 hour' where id = pg_temp.bout();
update public.events set locks_at = now() - interval '1 hour', status = 'live' where id = pg_temp.ev();

-- This week's pairs, and the player who plays twice.
create temp table pairs as
  select s.user_a, s.user_b from public.league_schedule(pg_temp.lg(), null) s where s.event_id = pg_temp.ev();
create temp table twice as
  select x.uid from (select user_a as uid from pairs union all select user_b from pairs) x
  group by x.uid having count(*) = 2;
create function pg_temp.dbl() returns uuid language sql as $$ select uid from twice $$;
create function pg_temp.opps() returns uuid[] language sql as $$
  select array_agg(case when user_a = pg_temp.dbl() then user_b else user_a end order by 1)
  from pairs where pg_temp.dbl() in (user_a, user_b)
$$;

create function pg_temp.score(who uuid, pts int) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy, provisional)
  values (who, pg_temp.bout(), null, pts, pts, '{}'::jsonb, pts > 0, true, false)
  on conflict (user_id, bout_id) do update set points = excluded.points, casual_points = excluded.casual_points,
    computed_at = clock_timestamp()
$$;

select is((select count(*)::int from twice), 1, 'an odd league has one player in a doubleheader');

-- The doubleheader player leads both, then both opponents pass them.
select pg_temp.score(pg_temp.dbl(), 50);
select public.claim_matchup_notifications(pg_temp.ev());
select pg_temp.score(o, 100) from unnest(pg_temp.opps()) o;
create temp table sent as select * from public.claim_matchup_notifications(pg_temp.ev());

select is((select count(*)::int from sent where user_id = pg_temp.dbl()), 2,
  'the player with two matchups hears about each');
select is((select array_agg((payload->>'opponentId')::uuid order by 1) from sent where user_id = pg_temp.dbl()),
  pg_temp.opps(), 'naming each opponent, so the tap opens the right one');
select is((select count(distinct key)::int from public.notifications_sent where user_id = pg_temp.dbl() and kind = 'matchup'),
  2, 'as two inbox rows');

-- A void deletes one opponent's score: that matchup flips back.
delete from public.scores where user_id = (pg_temp.opps())[1] and bout_id = pg_temp.bout();
create temp table voided as select * from public.claim_matchup_notifications(pg_temp.ev());
select is((select array_agg(user_id order by user_id) from voided),
  (select array_agg(x order by x) from unnest(array[pg_temp.dbl(), (pg_temp.opps())[1]]) x),
  'a score deleted by a void is a change too, and flips that matchup back');
select is((select bool_and((payload->>'lead')::boolean) from voided where user_id = pg_temp.dbl()), true,
  'giving the lead back to the player who kept their points');

-------------------------------------------------------------------------------
-- Who may call the internals
-------------------------------------------------------------------------------

select ok(not has_function_privilege('service_role', 'public.league_table(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.max_lead_pushes()', 'execute'),
  'the internals are for these functions only');
select ok(has_function_privilege('service_role', 'public.claim_matchup_notifications(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.claim_standing_notifications()', 'execute'),
  'the results job can claim both');
select ok(not has_function_privilege('authenticated', 'public.claim_matchup_notifications(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.inbox_items(integer)', 'execute'),
  'players can read their inbox but not claim pushes');

select * from finish();
rollback;
