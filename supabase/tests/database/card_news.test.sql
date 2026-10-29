-- Card news: odds flips reach the players who picked the fight, each way once,
-- through the odds sync's own role; unusual start times reach everyone once
-- and a move once more; rank-ups go out once per rank; night-time pushes wait;
-- a bad time zone can't break anything; older builds don't see the new kinds.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- A Saturday 8 PM Eastern main card. The schedule checks run as of two days
-- before it, so the test doesn't depend on today's weekday.
create function pg_temp.sat8() returns timestamptz language sql as $$
  select (date_trunc('week', ((now() at time zone 'America/New_York')::date + 2)::timestamp) + interval '5 days 20 hours')
         at time zone 'America/New_York'
$$;

select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'cn1', 'name', 'UFC 999: Odds vs. Ends', 'startsAt', pg_temp.sat8() - interval '2 hours', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'cn1' || o, 'order', o, 'segment', case when o = 1 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'cn1r' || o, 'name', 'Red Fighter ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'cn1b' || o, 'name', 'Blue Fighter ' || o, 'nickname', null)))
    from generate_series(1, 2) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'cn1' $$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'cn1' || o $$;
create function pg_temp.sent(k text) returns int language sql as $$
  select count(*)::int from public.notifications_sent where kind = k
$$;
create function pg_temp.odds(o int, red int, blue int) returns integer language sql as $$
  select public.record_odds(jsonb_build_array(jsonb_build_object('boutId', pg_temp.bid(o), 'redOdds', red, 'blueOdds', blue)), '{}', 100)
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'cn' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = 'News' || v.n from generate_series(1, 3) v(n) where p.id = pg_temp.u(v.n);
-- 04 never finished signing up.

-- Main card at 8 PM, prelims at 6.
update public.bouts set locks_at = pg_temp.sat8() where id = pg_temp.bid(1);
update public.bouts set locks_at = pg_temp.sat8() - interval '2 hours' where id = pg_temp.bid(2);
update public.events set locks_at = pg_temp.sat8() - interval '2 hours' where id = pg_temp.ev();

-- 01 and 02 picked red in fight 1, 03 picked blue.
set local session_replication_role = replica;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, case when n = 3 then b.blue_fighter_id else b.red_fighter_id end, 'ANY'
from public.bouts b, generate_series(1, 3) n where b.id = pg_temp.bid(1);
set local session_replication_role = origin;

-- Somewhere for invoke_activity_push to send, so its calls can be counted.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    perform vault.create_secret('http://127.0.0.1:54321', 'project_url');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'card_sync_secret') then
    perform vault.create_secret('test-secret', 'card_sync_secret');
  end if;
end;
$$;
create function pg_temp.calls() returns int language sql as $$ select count(*)::int from net.http_request_queue $$;
create temp table calls_before as select pg_temp.calls() as n;

-- Odds flips --------------------------------------------------------------------

set local role service_role;
select pg_temp.odds(1, -200, 170);
reset role;
select is(pg_temp.sent('odds'), 0, 'the first odds are no flip');

set local role service_role;
select pg_temp.odds(1, 150, -170);
reset role;
select is(pg_temp.sent('odds'), 3, 'a flip reaches everyone who picked the fight, through the odds sync''s role');
select is((select (payload ->> 'pickedIsDog')::boolean from public.notifications_sent where kind = 'odds' and user_id = pg_temp.u(1)),
  true, 'red is now the underdog for a red pick');
select is((select (payload ->> 'pickedIsDog')::boolean from public.notifications_sent where kind = 'odds' and user_id = pg_temp.u(3)),
  false, 'and blue the favorite for a blue pick');
select is((select payload - 'eventId' - 'boutId' from public.notifications_sent where kind = 'odds' and user_id = pg_temp.u(1)),
  '{"event": "UFC 999: Odds vs. Ends", "picked": "Red Fighter 1", "pickedIsDog": true, "dog": "Red Fighter 1", "favorite": "Blue Fighter 1"}'::jsonb,
  'with the names');
select is((select bool_and(not pushed) from public.notifications_sent where kind = 'odds'), true, 'queued for the push');

set local role service_role;
select pg_temp.odds(1, -200, 170);
select pg_temp.odds(1, 150, -170);
reset role;
select is(pg_temp.sent('odds'), 6, 'flipping back is told once, and a line wobbling back again isn''t');

-- Blue, a pick'em, then red.
set local session_replication_role = replica;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(1), b.id, b.version, b.red_fighter_id, 'ANY' from public.bouts b where b.id = pg_temp.bid(2);
set local session_replication_role = origin;
set local role service_role;
select pg_temp.odds(2, -150, 130);
select pg_temp.odds(2, -110, -110);
reset role;
select is((select last_underdog_corner::text from public.bouts where id = pg_temp.bid(2)), 'blue', 'a level line keeps the last underdog');
set local role service_role;
select pg_temp.odds(2, -108, -112);
reset role;
select is((select underdog_corner from public.bouts where id = pg_temp.bid(2)), null, 'a pick''em line has no underdog');
select is((select last_underdog_corner::text from public.bouts where id = pg_temp.bid(2)), 'blue', 'and keeps the last one');
select is((select count(*)::int from public.notifications_sent where kind = 'odds' and payload ->> 'boutId' = pg_temp.bid(2)::text), 0,
  'an underdog becoming a pick''em sends nothing');
set local role service_role;
select pg_temp.odds(2, 150, -170);
reset role;
select is((select count(*)::int from public.notifications_sent where kind = 'odds' and payload ->> 'boutId' = pg_temp.bid(2)::text), 1,
  'blue to a pick''em to red is a flip');

-- One sync over a whole card is one push call.
delete from public.notifications_sent where kind = 'odds';
create temp table calls_mid as select pg_temp.calls() as n;
set local role service_role;
select public.record_odds(jsonb_build_array(
  jsonb_build_object('boutId', pg_temp.bid(1), 'redOdds', -300, 'blueOdds', 250),
  jsonb_build_object('boutId', pg_temp.bid(2), 'redOdds', -350, 'blueOdds', 300)), '{}', 100);
reset role;
select is(pg_temp.sent('odds'), 4, 'both fights flip');
select is(pg_temp.calls() - (select n from calls_mid), 1, 'with one push call for the run');

-- A substitution starts over: the new pairing's first odds are no flip.
update public.bouts set blue_fighter_id = (select id from public.fighters where ufc_fighter_id = 'cn1r2') where id = pg_temp.bid(1);
select is((select last_underdog_corner from public.bouts where id = pg_temp.bid(1)), null, 'new fighters have no last underdog');

-- A bout with no lock of its own goes by the card's.
update public.bouts set locks_at = null where id = pg_temp.bid(2);
set local role service_role;
select lives_ok($$select pg_temp.odds(2, 300, -350)$$, 'a bout without its own lock still syncs');
reset role;
select is((select count(*)::int from public.notifications_sent where kind = 'odds' and payload ->> 'boutId' = pg_temp.bid(2)::text
           and key like '%:red'), 1, 'and still tells its picks');
update public.bouts set locks_at = pg_temp.sat8() - interval '2 hours' where id = pg_temp.bid(2);

-- Unusual start times --------------------------------------------------------

select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 0, 'a Saturday 8 PM main card is usual');

-- The card moves to a Saturday 2 PM main card.
update public.bouts set locks_at = locks_at - interval '6 hours' where event_id = pg_temp.ev();
update public.events set locks_at = locks_at - interval '6 hours' where id = pg_temp.ev();
select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 3, 'an afternoon main card is told to everyone signed up');
select is((select payload ->> 'when' from public.notifications_sent where kind = 'schedule' limit 1), 'early', 'as earlier than usual');
select is((select (payload ->> 'hasPrelims')::boolean from public.notifications_sent where kind = 'schedule' limit 1), true, 'with prelims first');
select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 0, 'once');

update public.bouts set locks_at = locks_at + interval '1 hour' where event_id = pg_temp.ev();
update public.events set locks_at = locks_at + interval '1 hour' where id = pg_temp.ev();
select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 3, 'a move of an hour is told again');
select is((select count(*)::int from public.notifications_sent where kind = 'schedule' and payload ->> 'when' = 'moved'), 3, 'as moved');
update public.bouts set locks_at = locks_at + interval '10 minutes' where event_id = pg_temp.ev();
update public.events set locks_at = locks_at + interval '10 minutes' where id = pg_temp.ev();
select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 0, 'ten minutes isn''t');

-- A banned player hears nothing new.
set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action) values (0, pg_temp.u(2), 'ban');
set local session_replication_role = origin;
update public.bouts set locks_at = locks_at + interval '2 hours' where event_id = pg_temp.ev();
update public.events set locks_at = locks_at + interval '2 hours' where id = pg_temp.ev();
select is(public.queue_schedule_notifications(pg_temp.sat8() - interval '2 days'), 2, 'a banned player isn''t told');
delete from public.moderation_actions where player = pg_temp.u(2);

-- Sending ----------------------------------------------------------------------

-- 01 is in a zone where it's 3 AM now, 03 in one where it's noon.
update public.profiles set time_zone = (
  select z.name from pg_timezone_names z
  where extract(hour from now() at time zone z.name) = 3 and z.name like '%/%' order by z.name limit 1)
where id = pg_temp.u(1);
update public.profiles set time_zone = (
  select z.name from pg_timezone_names z
  where extract(hour from now() at time zone z.name) = 12 and z.name like '%/%' order by z.name limit 1)
where id = pg_temp.u(3);
update public.profiles set time_zone = 'Not/AZone' where id = pg_temp.u(2);
select is((select time_zone from public.profiles where id = pg_temp.u(2)), null, 'a zone Postgres doesn''t know is stored as none');

create temp table claimed as select * from public.claim_activity_notifications();
select is((select count(*)::int from claimed where user_id = pg_temp.u(1) and kind in ('odds', 'schedule')), 0,
  'at 3 AM, odds and schedule pushes wait');
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'schedule' and not pushed), 3,
  'still queued');
select ok((select count(*) from claimed where user_id = pg_temp.u(3) and kind = 'schedule') > 0, 'at noon they go');
select is((select payload ->> 'tz' from claimed where user_id = pg_temp.u(3) and kind = 'schedule' limit 1),
  (select time_zone from public.profiles where id = pg_temp.u(3)), 'with the player''s zone for the times');
select ok((select bool_and(wanted) from claimed where user_id = pg_temp.u(3) and kind in ('odds', 'schedule')), 'and are wanted');

-- A push that would miss its lock by waiting goes now, even at 3 AM.
insert into public.notifications_sent (user_id, kind, key, payload, pushed)
values (pg_temp.u(1), 'schedule', 'soon', jsonb_build_object('firstAt', now() + interval '2 hours'), false);
select is((select count(*)::int from public.claim_activity_notifications() where user_id = pg_temp.u(1)), 1,
  'a push whose lock comes before morning isn''t held');
-- One whose card is already under way is dropped.
insert into public.notifications_sent (user_id, kind, key, payload, pushed)
values (pg_temp.u(3), 'schedule', 'late', jsonb_build_object('firstAt', now() - interval '1 hour'), false);
select is((select wanted from public.claim_activity_notifications() where user_id = pg_temp.u(3)), false,
  'a schedule push after the card started is dropped');
select lives_ok($$select public.card_news_tick()$$, 'the cron runs');

update public.profiles set notify_card_news = false where id = pg_temp.u(3);
insert into public.notifications_sent (user_id, kind, key, payload, pushed)
values (pg_temp.u(3), 'schedule', 'manual', jsonb_build_object('firstAt', now() + interval '1 day'), false);
select is((select wanted from public.claim_activity_notifications() where user_id = pg_temp.u(3)), false,
  'the card news toggle turns them off');

-- Rank-ups -------------------------------------------------------------------

-- 01 has four cards: Prospect. One more is Contender.
insert into public.events (id, name, starts_at, locks_at, status)
select gen_random_uuid(), 'Old card ' || n, now() - make_interval(days => 7 * n), now() - make_interval(days => 7 * n), 'complete'
from generate_series(1, 5) n;
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
select e.id, pg_temp.u(1), 10, 0, 3, 'L' from public.events e where e.name in ('Old card 2', 'Old card 3', 'Old card 4', 'Old card 5');
select is((select count(*)::int from public.claim_rank_notifications((select id from public.events where name = 'Old card 2'))), 0,
  'a Prospect hears nothing');
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
select e.id, pg_temp.u(1), 10, 0, 3, 'L' from public.events e where e.name = 'Old card 1';
select is((select payload ->> 'rank' from public.claim_rank_notifications((select id from public.events where name = 'Old card 1'))),
  'Contender', 'five career points is Contender');
select is((select key from public.notifications_sent where kind = 'rank' and user_id = pg_temp.u(1)), 'pre:Contender',
  'keyed to the pre-season');
select is((select count(*)::int from public.claim_rank_notifications((select id from public.events where name = 'Old card 1'))), 0,
  'and told once');

-- Older builds -----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(3), 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.my_notifications() where kind in ('odds', 'schedule', 'rank')), 0,
  'older builds don''t see the new kinds');
select ok((select count(*) from public.inbox_items() where kind = 'schedule') > 0, 'this build does');

-- Access -----------------------------------------------------------------------

select throws_ok($$select public.queue_schedule_notifications()$$, '42501', null, 'players can''t queue notices');
select throws_ok($$select public.claim_rank_notifications(pg_temp.ev())$$, '42501', null, 'or claim rank-ups');
reset role;
set local role service_role;
select lives_ok($$select public.claim_rank_notifications(gen_random_uuid())$$, 'the results sync can');
reset role;

select * from finish();
rollback;
