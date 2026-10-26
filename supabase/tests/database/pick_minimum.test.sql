-- Pick minimum warnings: the day-before reminder for players short of a
-- league's minimum, the reminder an hour before a later section with a
-- required fight still to pick, inbox rows without a push token, and the
-- owner's count of who has picked.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.bout(fight text, ord int, seg text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'order', ord, 'segment', seg, 'scheduledRounds', 3,
    'weightClass', null, 'red', pg_temp.f(fight || 'r'), 'blue', pg_temp.f(fight || 'b'))
$$;
create function pg_temp.bid(fight text) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = fight $$;
create function pg_temp.ev(ufc text) returns uuid language sql as $$ select id from public.events where ufc_event_id = ufc $$;
create function pg_temp.fid(u text) returns uuid language sql as $$ select id from public.fighters where ufc_fighter_id = u $$;
create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000a' || n)::uuid $$;
create function pg_temp.pick(n int, fight text) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  values (pg_temp.u(n), pg_temp.bid(fight), 1, pg_temp.fid(fight || 'r'), 'ANY')
$$;

-- Only this test's cards are due.
update public.events set status = 'cancelled' where status in ('scheduled', 'live');

-- p1: starts tomorrow, three main card fights.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'p1', 'name', 'UFC 998: Short vs. Picks', 'startsAt', now() + interval '20 hours',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    pg_temp.bout('p11', 1, 'main'), pg_temp.bout('p12', 2, 'main'), pg_temp.bout('p13', 3, 'main'))));
update public.events set starts_at = now() + interval '20 hours', locks_at = now() + interval '20 hours' where id = pg_temp.ev('p1');
update public.bouts set locks_at = null where event_id = pg_temp.ev('p1');

-- p2: early prelims locked an hour ago, prelims lock in 40 minutes, the main
-- card in 3 hours.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'p2', 'name', 'UFC Fight Night: Section vs. Lock', 'startsAt', now() + interval '3 hours',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    pg_temp.bout('p21', 1, 'main'), pg_temp.bout('p22', 2, 'prelims'), pg_temp.bout('p23', 3, 'early_prelims'))));
update public.events set status = 'live', locks_at = now() - interval '1 hour' where id = pg_temp.ev('p2');
update public.bouts set locks_at = now() + interval '3 hours' where id = pg_temp.bid('p21');
update public.bouts set locks_at = now() + interval '40 minutes' where id = pg_temp.bid('p22');
update public.bouts set locks_at = now() - interval '1 hour' where id = pg_temp.bid('p23');

insert into auth.users (id, email) select pg_temp.u(n), 'p' || n || '@example.test' from generate_series(1, 5) n;
-- 1 owns the league and has a phone; 2 has no push token; 3 picked everything;
-- 4 left; 5 deleted their account.
insert into public.push_tokens (token, user_id) values ('ExponentPushToken[owner-phone]', pg_temp.u(1));
update public.profiles set time_zone = 'America/Chicago' where id = pg_temp.u(1);
update public.profiles set deleted_at = now() where id = pg_temp.u(5);

insert into public.leagues (id, name, owner_id, tier, created_at)
values ('00000000-0000-0000-0000-00000000b001', 'Whole Card League', pg_temp.u(1), 'pro', now() - interval '3 days');
insert into public.league_members (league_id, user_id, joined_at, left_at)
select '00000000-0000-0000-0000-00000000b001', pg_temp.u(n), now() - interval '3 days',
       case when n = 4 then now() - interval '1 day' end
from generate_series(1, 5) n;
delete from public.league_pick_rules where league_id = '00000000-0000-0000-0000-00000000b001';
insert into public.league_pick_rules (league_id, effective_at, scope)
values ('00000000-0000-0000-0000-00000000b001', now() - interval '3 days', 'whole_card');

select pg_temp.pick(1, 'p11');
select pg_temp.pick(3, 'p11'); select pg_temp.pick(3, 'p12'); select pg_temp.pick(3, 'p13');
-- On p2, 1 missed the early prelim (the week is already a forfeit) and 2
-- picked it but not the prelim.
select pg_temp.pick(2, 'p23');
select pg_temp.pick(3, 'p21'); select pg_temp.pick(3, 'p22');

create temp table got as select * from public.claim_reminders();

-- The day before.
select results_eq(
  $$select user_id, payload->>'league', (payload->>'required')::int, (payload->>'picked')::int,
           (payload->>'leagueMissing')::int, cardinality(tokens), wanted
    from got where payload->>'section' = 'eve' order by user_id$$,
  $$values (pg_temp.u(1), 'Whole Card League', 3, 1, 2, 1, true),
           (pg_temp.u(2), 'Whole Card League', 3, 0, 3, 0, true)$$,
  'the day-before reminder goes to each player short of the minimum, push token or not'
);
select is((select payload->>'tz' from got where payload->>'section' = 'eve' and user_id = pg_temp.u(1)), 'America/Chicago',
  'it carries the player''s time zone for the lock time');
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(2) and key = pg_temp.ev('p1') || ':eve'), 1,
  'the inbox row is written without a push token');
select is((select count(*)::int from got where user_id in (pg_temp.u(3), pg_temp.u(4), pg_temp.u(5))), 0,
  'nobody who met the minimum, left the league or deleted their account hears anything');

-- The section reminder.
select results_eq(
  $$select user_id, payload->>'segment', (payload->>'segmentMissing')::int, (payload->>'minutes')::int
    from got where payload->>'section' = 'segment' order by user_id$$,
  $$values (pg_temp.u(2), 'prelims', 1, 40)$$,
  'an hour before the prelims lock, only the player with a required prelim unpicked hears, not one already forfeited'
);
select is((select count(*)::int from got where payload->>'section' = 'segment' and payload->>'segment' = 'main'), 0,
  'the main card, 3 hours out, isn''t due yet');

select is((select count(*)::int from public.claim_reminders()), 0, 'each is sent once');

-- The main card section reminder and the 30-minute main card one are both
-- due: each keeps its own row.
update public.bouts set locks_at = now() + interval '25 minutes' where id = pg_temp.bid('p21');
select results_eq(
  $$select c.payload->>'section' from public.claim_reminders() c
    where c.user_id = pg_temp.u(2) and c.payload->>'event' = 'UFC Fight Night: Section vs. Lock' order by 1$$,
  $$values ('main'::text), ('segment')$$,
  'the main card section reminder doesn''t take the 30-minute reminder''s place'
);
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(2) and key like pg_temp.ev('p2') || ':%main'), 2,
  'two rows, two keys');

-- A bout entered by hand has no segment; it counts as main card and breaks nothing.
delete from public.notifications_sent where key like pg_temp.ev('p2') || ':%';
update public.bouts set card_segment = null where id = pg_temp.bid('p21');
select lives_ok($$select * from public.claim_reminders()$$, 'a bout with no segment doesn''t stop the reminders');

-- Too far out for the day-before one, and too close (the hour-out reminder's job).
delete from public.notifications_sent where key like pg_temp.ev('p1') || ':%' or key = pg_temp.ev('p1')::text;
update public.events set starts_at = now() + interval '30 hours', locks_at = now() + interval '30 hours' where id = pg_temp.ev('p1');
select is((select count(*)::int from public.claim_reminders() c where c.payload->>'section' = 'eve'), 0,
  'nothing more than a day out');
update public.events set starts_at = now() + interval '45 minutes', locks_at = now() + interval '45 minutes' where id = pg_temp.ev('p1');
select results_eq(
  $$select c.user_id, c.payload->>'section' from public.claim_reminders() c
    where c.payload->>'event' = 'UFC 998: Short vs. Picks' order by c.user_id$$,
  $$values (pg_temp.u(1), null::text), (pg_temp.u(2), null::text), (pg_temp.u(3), null::text)$$,
  'inside 90 minutes it''s the usual hour-out reminder, now in every league member''s inbox'
);

-- The owner's view.
update public.events set starts_at = now() + interval '20 hours', locks_at = now() + interval '20 hours' where id = pg_temp.ev('p1');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq(
  $$select user_id, required, picked, missed, is_me from public.league_pick_status('00000000-0000-0000-0000-00000000b001', pg_temp.ev('p1'))$$,
  $$values (pg_temp.u(2), 3, 0, 0, false), (pg_temp.u(1), 3, 1, 0, true), (pg_temp.u(3), 3, 3, 0, false)$$,
  'the owner sees each active member''s count, fewest picked first'
);
select results_eq(
  $$select user_id, picked, missed from public.league_pick_status('00000000-0000-0000-0000-00000000b001', pg_temp.ev('p2')) order by user_id$$,
  $$values (pg_temp.u(1), 0, 1), (pg_temp.u(2), 1, 0), (pg_temp.u(3), 2, 1)$$,
  'and how many required fights locked unpicked'
);
select is(
  (select count(*)::int from public.league_pick_status('00000000-0000-0000-0000-00000000b001', pg_temp.ev('p1'))
   where display_name is null),
  0, 'names come through league_display_name');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$select * from public.league_pick_status('00000000-0000-0000-0000-00000000b001', pg_temp.ev('p1'))$$,
  'P0001', 'Only the league''s owner can see this.', 'a member who isn''t the owner is refused'
);
reset role;

select ok(not has_function_privilege('authenticated', 'public.pick_shortfall(uuid, uuid, timestamptz)', 'execute'),
  'players can''t call the shortfall helper directly');

select * from finish();
rollback;
