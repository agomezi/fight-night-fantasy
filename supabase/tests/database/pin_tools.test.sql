-- Managing pins from the profile: the "Pin a call" list holds only calls you
-- could pin, marks the pinned ones and underdogs, and a pin can move to the top.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'pt1', 'name', 'UFC Fight Night: Pin vs. Tools', 'startsAt', now() - interval '2 days', 'status', 'complete',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'pt1' || o, 'order', o, 'segment', 'main',
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'pt1r' || o, 'name', 'Red Fighter ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'pt1b' || o, 'name', 'Blue Fighter ' || o, 'nickname', null)))
    from generate_series(1, 3) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'pt1' || o $$;
insert into auth.users (id, email) values (pg_temp.u(1), 'pt1@example.test');
update public.profiles set display_name = 'Pinner' where id = pg_temp.u(1);

-- Red is the underdog and wins all three; 01 picked red on 1 and 2 (right),
-- blue on 3 (wrong).
set local session_replication_role = replica;
update public.bouts set underdog_corner = 'red' where ufc_fight_id like 'pt1%';
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(1), b.id, b.version, case when b.fight_order < 3 then b.red_fighter_id else b.blue_fighter_id end, 'ANY'
from public.bouts b where b.ufc_fight_id like 'pt1%';
set local session_replication_role = origin;
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'KO', 1, 'ufc_live' from public.bouts b where b.ufc_fight_id like 'pt1%';
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(1), b.id, null, case when b.fight_order < 3 then 75 else -50 end, 0, '{}', b.fight_order < 3, true
from public.bouts b where b.ufc_fight_id like 'pt1%';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.my_pinnable_calls()), 2, 'the list holds only the calls you got right');
select ok((select bool_and(underdog) from public.my_pinnable_calls()), 'and marks the underdogs you backed');
select public.pin_call(pg_temp.bid(1));
select is((select array_agg(bout_id) from public.my_pinnable_calls() where pinned), array[pg_temp.bid(1)],
  'and which are pinned already');

select public.pin_call(pg_temp.bid(2));
select is((select bout_id from public.pinned_calls(pg_temp.u(1)) limit 1), pg_temp.bid(2), 'the newest pin shows first');
select public.move_pin_to_top(pg_temp.bid(1));
select is((select bout_id from public.pinned_calls(pg_temp.u(1)) limit 1), pg_temp.bid(1), 'until another is moved to the top');

reset role;
set local role anon;
select throws_ok($$select * from public.my_pinnable_calls()$$, '42501', null, 'signed-out callers can''t list calls');

select * from finish();
rollback;
