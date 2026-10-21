-- Pinned calls: only a correct call on a final result can be pinned, at most
-- 3, and anyone signed in sees them unless they've blocked the player. A call
-- a correction makes wrong drops off, and gives its place back.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Five bouts, already fought.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'pn1', 'name', 'UFC Fight Night: Pin vs. Call', 'startsAt', now() - interval '2 days', 'status', 'complete',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'pn1' || o, 'order', o, 'segment', 'main',
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'pn1r' || o, 'name', 'Red Fighter ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'pn1b' || o, 'name', 'Blue Fighter ' || o, 'nickname', null)))
    from generate_series(1, 5) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'pn1' || o $$;
insert into auth.users (id, email) select pg_temp.u(n), 'pn' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = 'Pinner' || v.n from generate_series(1, 3) v(n) where p.id = pg_temp.u(v.n);

-- 01 picked red on all five, by KO in round 2. Red won 1-4; 5 is still provisional.
set local session_replication_role = replica;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
select pg_temp.u(1), b.id, b.version, b.red_fighter_id, 'round', 2, 'KO' from public.bouts b where b.ufc_fight_id like 'pn1%';
set local session_replication_role = origin;
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, case when b.fight_order = 5 then 'provisional' else 'final' end::public.result_status,
       b.red_fighter_id, 'KO', 2, 'ufc_live'
from public.bouts b where b.ufc_fight_id like 'pn1%';
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(1), b.id, null, 125, 125, '{}', b.fight_order <> 4, true from public.bouts b where b.ufc_fight_id like 'pn1%';
-- (Bout 4 scored as a miss.)

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.act(1);

select lives_ok($$select public.pin_call(pg_temp.bid(1))$$, 'a correct call on a final result can be pinned');
select lives_ok($$select public.pin_call(pg_temp.bid(1))$$, 'pinning it again changes nothing');
select throws_ok($$select public.pin_call(pg_temp.bid(4))$$, 'P0001', null, 'a missed call can''t be pinned');
select throws_ok($$select public.pin_call(pg_temp.bid(5))$$, 'P0001', null, 'nor one still provisional');
select public.pin_call(pg_temp.bid(2)), public.pin_call(pg_temp.bid(3));
select is((select count(*)::int from public.pinned_calls(pg_temp.u(1))), 3, 'three can be pinned');

-- A fourth needs a free place.
reset role;
update public.results set status = 'final' where bout_id = pg_temp.bid(5);
set local role authenticated;
select pg_temp.act(1);
select throws_ok($$select public.pin_call(pg_temp.bid(5))$$, 'P0001', 'You can pin 3 calls. Unpin one first.', 'but no more');

select is((select (picked_name, finish, finish_round, method, points, event_name)::text
           from public.pinned_calls(pg_temp.u(1)) where bout_id = pg_temp.bid(1)),
  '("Red Fighter 1",round,2,KO,125,"UFC Fight Night: Pin vs. Call")', 'each shows the call, its points and the card');

select pg_temp.act(2);
select is((select count(*)::int from public.pinned_calls(pg_temp.u(1))), 3, 'anyone signed in sees them');
reset role;
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(2), pg_temp.u(1));
set local role authenticated;
select pg_temp.act(2);
select is((select count(*)::int from public.pinned_calls(pg_temp.u(1))), 0, 'except someone who blocked them');

-- A correction makes call 2 wrong: it drops off, and its place frees up.
reset role;
update public.scores set correct = false where user_id = pg_temp.u(1) and bout_id = pg_temp.bid(2);
set local role authenticated;
select pg_temp.act(1);
select is((select count(*)::int from public.pinned_calls(pg_temp.u(1))), 2, 'a call corrected to wrong drops off');
select lives_ok($$select public.pin_call(pg_temp.bid(5))$$, 'and gives its place back');

select public.unpin_call(pg_temp.bid(1));
select is((select array_agg(bout_id order by bout_id) from public.pinned_calls(pg_temp.u(1))),
  (select array_agg(id order by id) from public.bouts where ufc_fight_id in ('pn13', 'pn15')), 'unpinning takes it off');

reset role;
set local role anon;
select throws_ok($$select * from public.pinned_calls(pg_temp.u(1))$$, '42501', null, 'signed-out callers can''t look');

select * from finish();
rollback;
