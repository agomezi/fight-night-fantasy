-- The main event changing fighters: before it locks, everyone who picked it
-- is told to pick again and their old pick counts as none; after it locks,
-- the co-main stands in. A draw or no contest leaves the card out.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Order 1 is the main event, 2 the co-main, 3 a prelim.
create function pg_temp.card(ev text, starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', starts, 'status', 'scheduled',
    'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', ev || o, 'order', o,
        'segment', case when o <= 2 then 'main' else 'prelims' end, 'scheduledRounds', 3, 'weightClass', null,
        'red', jsonb_build_object('ufcFighterId', ev || 'r' || o, 'name', 'Red ' || ev || o, 'nickname', null),
        'blue', jsonb_build_object('ufcFighterId', ev || 'b' || o, 'name', 'Blue ' || ev || o, 'nickname', null)))
      from generate_series(1, 3) o))
$$;
select public.sync_event_card(pg_temp.card('mc1', now() + interval '3 days'));
select public.sync_event_card(pg_temp.card('mc2', now() - interval '2 hours'));
select public.sync_event_card(pg_temp.card('mc3', now() - interval '2 hours'));

create function pg_temp.ev(code text) returns uuid language sql as $$
  select id from public.events where ufc_event_id = code
$$;
create function pg_temp.bout(code text, o int) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = code || o
$$;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'mc' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles set display_name = 'Main' || substring(id::text from 35);

-- Picks red on a bout as it stands now. Run as the owner, so the pick lock
-- lets it through.
create function pg_temp.pick(n int, code text, o int) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'DEC' from public.bouts b where b.id = pg_temp.bout(code, o)
  on conflict (user_id, bout_id) do update set bout_version = excluded.bout_version, picked_fighter_id = excluded.picked_fighter_id
$$;
-- Gives a bout a new blue corner: the fighter from bout 3's blue corner.
create function pg_temp.substitute(code text, o int) returns void language sql as $$
  update public.bouts set blue_fighter_id = (select blue_fighter_id from public.bouts where id = pg_temp.bout(code, 3))
  where id = pg_temp.bout(code, o)
$$;
create function pg_temp.queued() returns table (n int) language sql as $$
  select substring(user_id::text from 35)::int from public.notifications_sent
  where kind = 'reminder' and payload->>'section' = 'changed' order by 1
$$;

-------------------------------------------------------------------------------
-- Before the lock
-------------------------------------------------------------------------------

select pg_temp.pick(1, 'mc1', 1), pg_temp.pick(2, 'mc1', 1), pg_temp.pick(3, 'mc1', 2);
select pg_temp.substitute('mc1', 1);

select results_eq($$select * from pg_temp.queued()$$, $$values (1), (2)$$,
  'everyone who picked the main event is told it changed');
select is((select payload->>'blue' from public.notifications_sent where user_id = pg_temp.u(1) and payload->>'section' = 'changed'),
  'Blue mc13', 'naming the new pairing');
select ok((select bool_and(not pushed) from public.notifications_sent where payload->>'section' = 'changed'),
  'and it waits for the activity push');

update public.profiles set notify_reminders = false where id = pg_temp.u(2);
select results_eq(
  $$select substring(user_id::text from 35)::int, wanted from public.claim_activity_notifications() order by 1$$,
  $$values (1, true), (2, false)$$,
  'it follows the reminders toggle');

select pg_temp.substitute('mc1', 2);
select results_eq($$select * from pg_temp.queued()$$, $$values (1), (2)$$, 'a change to another bout tells nobody');

select ok(not public.met_tier_picks('pro', pg_temp.u(1), pg_temp.ev('mc1')), 'the old pick no longer meets Pro''s required pick');

-- An hour out, the lock reminder treats the old pick as no pick.
update public.events set locks_at = now() + interval '50 minutes' where id = pg_temp.ev('mc1');
insert into public.push_tokens (token, user_id) values ('ExponentPushToken[mc1-player]', pg_temp.u(1));
select is((select (payload->>'hasMainPick')::boolean from public.claim_reminders() where user_id = pg_temp.u(1)), false,
  'the lock reminder asks for the main event again');

select pg_temp.pick(1, 'mc1', 1);
select ok(public.met_tier_picks('pro', pg_temp.u(1), pg_temp.ev('mc1')), 'picking it again does');

-------------------------------------------------------------------------------
-- After the lock
-------------------------------------------------------------------------------

select pg_temp.pick(n, 'mc2', o) from generate_series(1, 4) n, generate_series(1, 2) o;
delete from public.notifications_sent;
select pg_temp.substitute('mc2', 1);

select is_empty($$select * from pg_temp.queued()$$, 'a change after the lock tells nobody');
select is(public.pro_main_event(pg_temp.ev('mc2')), pg_temp.bout('mc2', 2), 'the co-main stands in as the main event');
select ok(public.met_tier_picks('pro', pg_temp.u(1), pg_temp.ev('mc2')), 'and is Pro''s required pick');

-- Scored: the changed main event is void for everyone, the co-main splits 1-4.
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(n), pg_temp.bout('mc2', 1), null::uuid, 0, 0, '{}'::jsonb, false, false from generate_series(1, 4) n
union all
select pg_temp.u(n), pg_temp.bout('mc2', 2), null, n * 10, n * 10, '{}'::jsonb, true, true from generate_series(1, 4) n;
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'DEC', null, 'ufc_live' from public.bouts b where b.event_id = pg_temp.ev('mc2');
update public.events set status = 'complete' where id = pg_temp.ev('mc2');
select public.settle_event(pg_temp.ev('mc2'));
select results_eq(
  $$select substring(user_id::text from 35)::int, result from public.card_results where event_id = pg_temp.ev('mc2') order by 1$$,
  $$values (1, 'L'), (2, 'L'), (3, 'W'), (4, 'W')$$,
  'the pro record is decided on the co-main');

-- A replacement main event the feed lists as a new fight, after the lock.
select public.sync_event_card(pg_temp.card('mc4', now() - interval '2 hours'));
update public.events set created_at = now() - interval '1 day' where id = pg_temp.ev('mc4');
update public.bouts set status = 'cancelled', fight_order = 9 where id = pg_temp.bout('mc4', 1);
insert into public.bouts (ufc_fight_id, event_id, fight_order, card_segment, scheduled_rounds, red_fighter_id, blue_fighter_id)
select 'mc4new', b.event_id, 1, 'main', 5, b.red_fighter_id, (select blue_fighter_id from public.bouts where id = pg_temp.bout('mc4', 3))
from public.bouts b where b.id = pg_temp.bout('mc4', 1);
select ok(public.changed_after_lock((select id from public.bouts where ufc_fight_id = 'mc4new')),
  'a fight first stored after the lock counts as changed after it');
select is(public.pro_main_event(pg_temp.ev('mc4')), pg_temp.bout('mc4', 2), 'so the co-main still stands in');

-------------------------------------------------------------------------------
-- A draw or no contest
-------------------------------------------------------------------------------

select pg_temp.pick(n, 'mc3', o) from generate_series(1, 4) n, generate_series(1, 2) o;
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(n), pg_temp.bout('mc3', o), null::uuid, case when o = 1 then 0 else n * 10 end, 0, '{}'::jsonb, o = 2, o = 2
from generate_series(1, 4) n, generate_series(1, 2) o;
insert into public.results (bout_id, status, void_reason, source)
values (pg_temp.bout('mc3', 1), 'final', 'NC', 'ufc_live');
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'DEC', null, 'ufc_live' from public.bouts b
where b.event_id = pg_temp.ev('mc3') and b.fight_order > 1;
update public.events set status = 'complete' where id = pg_temp.ev('mc3');
select public.settle_event(pg_temp.ev('mc3'));
select is_empty($$select * from public.card_results where event_id = pg_temp.ev('mc3')$$,
  'a main event no contest leaves the card out of the pro record');
select is(public.pro_main_event(pg_temp.ev('mc3')), pg_temp.bout('mc3', 1), 'it stays the main event');

select * from finish();
rollback;
