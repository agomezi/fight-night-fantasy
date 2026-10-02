-- Fight-card sync: idempotent upserts, substitutions, cancellations, the lock
-- freezing an event's times, and season slots assigned at lock.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- A card in the shape parseCard produces. Fighters are named by UFC id.
create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.bout(fight text, ord int, red text, blue text, seg text default 'main', rounds int default 3)
returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'order', ord, 'segment', seg, 'scheduledRounds', rounds,
    'weightClass', 'Lightweight', 'red', pg_temp.f(red), 'blue', pg_temp.f(blue))
$$;
create function pg_temp.card(event text, starts text, bouts jsonb, status text default 'scheduled')
returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', event, 'name', 'Card ' || event, 'startsAt', starts,
    'status', status, 'bouts', bouts, 'issues', '[]'::jsonb)
$$;
create function pg_temp.b(fight text) returns public.bouts language sql as $$
  select * from public.bouts where ufc_fight_id = fight
$$;

-------------------------------------------------------------------------------
-- First sync
-------------------------------------------------------------------------------

select is(
  public.sync_event_card(pg_temp.card('100', '2099-10-03T20:00Z', jsonb_build_array(
    pg_temp.bout('1', 1, 'r1', 'b1', 'main', 5),
    pg_temp.bout('2', 2, 'r2', 'b2'),
    pg_temp.bout('3', 3, 'r3', 'b3', 'prelims'),
    pg_temp.bout('4', 4, 'r4', 'b4', null)
  ))) - 'event_id',
  '{"added": 4, "changed": 0, "substituted": 0, "reinstated": 0, "cancelled": 0}'::jsonb,
  'a new card adds every bout'
);

select results_eq(
  $$select name, starts_at, locks_at, status::text from public.events where ufc_event_id = '100'$$,
  $$values ('Card 100', '2099-10-03T20:00Z'::timestamptz, '2099-10-03T20:00Z'::timestamptz, 'scheduled')$$,
  'the event locks when its first bout starts'
);
select is((select count(*)::int from public.fighters where ufc_fighter_id in ('r1','b1','r2','b2','r3','b3','r4','b4')), 8, 'every fighter is created once');
select is((pg_temp.b('1')).scheduled_rounds, 5::smallint, 'rounds come from the card');
select is((pg_temp.b('1')).card_segment, 'main'::public.card_segment, 'segment comes from the card');
select is((pg_temp.b('4')).card_segment, null, 'a bout with no segment yet stores null');
select is((pg_temp.b('3')).weight_class, 'Lightweight', 'weight class comes from the card');
select is((select season_id from public.events where ufc_event_id = '100'), null, 'an announced event has no season slot');

-------------------------------------------------------------------------------
-- Idempotence
-------------------------------------------------------------------------------

-- Updated rows get a new tuple, so ctid shows whether anything was written
-- (updated_at cannot: now() is fixed for the whole test transaction).
create temp table before_resync as
  select id, ctid as tid from public.bouts union all select id, ctid from public.events
  union all select id, ctid from public.fighters;

select is(
  public.sync_event_card(pg_temp.card('100', '2099-10-03T20:00Z', jsonb_build_array(
    pg_temp.bout('1', 1, 'r1', 'b1', 'main', 5),
    pg_temp.bout('2', 2, 'r2', 'b2'),
    pg_temp.bout('3', 3, 'r3', 'b3', 'prelims'),
    pg_temp.bout('4', 4, 'r4', 'b4', null)
  ))) - 'event_id',
  '{"added": 0, "changed": 0, "substituted": 0, "reinstated": 0, "cancelled": 0}'::jsonb,
  'the same card twice changes nothing'
);
select is((select count(*)::int from public.bouts b join public.events e on e.id = b.event_id where e.ufc_event_id = '100'), 4, 'no bout is duplicated');
select is((select count(*)::int from public.fighters), 8, 'no fighter is duplicated');
select is(
  (select count(*)::int from before_resync r
   where r.tid not in (select ctid from public.bouts where id = r.id
                        union all select ctid from public.events where id = r.id
                        union all select ctid from public.fighters where id = r.id)),
  0, 'an unchanged card writes no rows'
);

-------------------------------------------------------------------------------
-- Changes on an upcoming card
-------------------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test');
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish) values (
  '00000000-0000-0000-0000-0000000000a1', (pg_temp.b('2')).id, 1,
  (select id from public.fighters where ufc_fighter_id = 'r2'), 'DEC');

-- Bout 2: b2 withdraws for x2. Bout 3: corners swap. Bout 4: drops off the
-- card. Bout 5: new, booked into bout 4's old slot. Bout 1 and 2 swap places.
select is(
  public.sync_event_card(pg_temp.card('100', '2099-10-04T18:00Z', jsonb_build_array(
    pg_temp.bout('2', 1, 'r2', 'x2'),
    pg_temp.bout('1', 2, 'r1', 'b1', 'main', 5),
    pg_temp.bout('3', 3, 'b3', 'r3', 'prelims'),
    pg_temp.bout('5', 4, 'r5', 'b5', 'early_prelims')
  ))) - 'event_id',
  '{"added": 1, "changed": 3, "substituted": 1, "reinstated": 0, "cancelled": 1}'::jsonb,
  'the summary counts each kind of change'
);
set constraints all immediate;
select pass('a reorder and a new bout in a cancelled bout''s slot satisfy the order constraint');
select throws_ok(
  $$update public.bouts set fight_order = 1 where ufc_fight_id = '1'$$,
  '23P01', null, 'two scheduled bouts still cannot share a slot'
);
set constraints all deferred;

select is((pg_temp.b('2')).version, 2, 'a substitution bumps the bout version');
select is((pg_temp.b('2')).blue_fighter_id, (select id from public.fighters where ufc_fighter_id = 'x2'), 'the replacement takes the slot');
select is((pg_temp.b('3')).version, 1, 'a corner swap is not a substitution');
select is((pg_temp.b('3')).red_fighter_id, (select id from public.fighters where ufc_fighter_id = 'b3'), 'but the corners are updated');
select is((pg_temp.b('4')).status, 'cancelled'::public.bout_status, 'a bout dropped from the card is cancelled');
select is((pg_temp.b('4')).fight_order, 4::smallint, 'a cancelled bout keeps its slot');
select is((pg_temp.b('5')).fight_order, 4::smallint, 'a live bout can take a cancelled bout''s slot');
select is(((pg_temp.b('1')).fight_order, (pg_temp.b('2')).fight_order), (2::smallint, 1::smallint), 'bouts can swap places');
select is((select starts_at from public.events where ufc_event_id = '100'), '2099-10-04T18:00Z'::timestamptz, 'an unlocked event follows a new start time');
select is((select locks_at from public.events where ufc_event_id = '100'), '2099-10-04T18:00Z'::timestamptz, 'and so does its lock');

select throws_ok(
  $$update public.picks set finish = 'ANY', method = 'KO' where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  'P0001', 'pick is against bout version 1, current is 2',
  'a pick made before a substitution can no longer be edited as it was'
);

-- Bout 4 is rebooked.
select is(
  public.sync_event_card(pg_temp.card('100', '2099-10-04T18:00Z', jsonb_build_array(
    pg_temp.bout('2', 1, 'r2', 'x2'),
    pg_temp.bout('1', 2, 'r1', 'b1', 'main', 5),
    pg_temp.bout('3', 3, 'b3', 'r3', 'prelims'),
    pg_temp.bout('5', 4, 'r5', 'b5', 'early_prelims'),
    pg_temp.bout('4', 5, 'r4', 'b4', 'early_prelims')
  ))) - 'event_id',
  '{"added": 0, "changed": 1, "substituted": 0, "reinstated": 1, "cancelled": 0}'::jsonb,
  'a bout back on the card is reinstated'
);
select is((pg_temp.b('4')).status, 'scheduled'::public.bout_status, 'and scheduled again');

-- A fighter's name is corrected upstream.
select lives_ok(
  $$select public.sync_event_card(pg_temp.card('100', '2099-10-04T18:00Z',
    jsonb_build_array(pg_temp.bout('2', 1, 'r2', 'x2')) ||
    jsonb_build_array(jsonb_set(pg_temp.bout('1', 2, 'r1', 'b1', 'main', 5), '{red,name}', '"Corrected Name"')) ||
    jsonb_build_array(pg_temp.bout('3', 3, 'b3', 'r3', 'prelims'), pg_temp.bout('5', 4, 'r5', 'b5', 'early_prelims'),
                      pg_temp.bout('4', 5, 'r4', 'b4', 'early_prelims'))))$$,
  'a renamed fighter syncs'
);
select is((select name from public.fighters where ufc_fighter_id = 'r1'), 'Corrected Name', 'fighter names follow the card');

-- A manually entered bout has no UFC id and the sync never cancels it.
insert into public.bouts (event_id, fight_order, card_segment, red_fighter_id, blue_fighter_id)
select id, 6, 'early_prelims', (select id from public.fighters where ufc_fighter_id = 'r4'),
       (select id from public.fighters where ufc_fighter_id = 'b4')
from public.events where ufc_event_id = '100';
do $$ begin perform public.sync_event_card(pg_temp.card('100', '2099-10-04T18:00Z', jsonb_build_array(pg_temp.bout('2', 1, 'r2', 'x2')))); end $$;
select is(
  (select b.status from public.bouts b join public.events e on e.id = b.event_id where e.ufc_event_id = '100' and b.ufc_fight_id is null),
  'scheduled'::public.bout_status, 'a bout entered by hand is left alone'
);

select throws_ok(
  $$select public.sync_event_card(pg_temp.card('100', '2099-10-04T18:00Z', '[]'::jsonb))$$,
  'P0001', 'card for event 100 has no bouts',
  'an empty card is refused rather than cancelling everything'
);

-------------------------------------------------------------------------------
-- Locked and finished events
-------------------------------------------------------------------------------

do $$ begin perform public.sync_event_card(pg_temp.card('200', '2020-01-04T18:00Z', jsonb_build_array(pg_temp.bout('20', 1, 'r20', 'b20')))); end $$;
do $$ begin perform public.sync_event_card(pg_temp.card('200', '2020-01-05T18:00Z', jsonb_build_array(pg_temp.bout('20', 1, 'r20', 'b20')), 'live')); end $$;
select results_eq(
  $$select starts_at, locks_at, status::text from public.events where ufc_event_id = '200'$$,
  $$values ('2020-01-04T18:00Z'::timestamptz, '2020-01-04T18:00Z'::timestamptz, 'live')$$,
  'a locked event keeps its times, so a late change cannot reopen picks'
);

update public.events set status = 'complete' where ufc_event_id = '200';
select is(
  public.sync_event_card(pg_temp.card('200', '2020-01-04T18:00Z', jsonb_build_array(pg_temp.bout('21', 1, 'r21', 'b21')), 'complete'))->>'skipped',
  'complete', 'a complete event is not synced'
);
select is((pg_temp.b('20')).status, 'scheduled'::public.bout_status, 'and its bouts are not cancelled');
select is(pg_temp.b('21'), null::public.bouts, 'nor are new bouts added to it');

-------------------------------------------------------------------------------
-- Season slots
-------------------------------------------------------------------------------

-- Fourteen past cards, one a week, plus one cancelled and one upcoming.
do $$ begin
  perform public.sync_event_card(pg_temp.card((300 + i)::text,
    to_char('2021-01-02T20:00Z'::timestamptz + (i - 1) * interval '7 days', 'YYYY-MM-DD"T"HH24:MI"Z"'),
    jsonb_build_array(pg_temp.bout((3000 + i)::text, 1, 'r' || (3000 + i), 'b' || (3000 + i)))))
  from generate_series(1, 14) i;
end $$;
update public.events set status = 'cancelled' where ufc_event_id = '305';

select is(public.assign_season_slots(), 0, 'nothing is slotted before season 1 is opened');

-- Season 1 opens after the first two cards.
insert into public.seasons (number, starts_at) values (1, '2021-01-10T00:00Z');
select is(public.assign_season_slots(), 11, 'locked events after the season opened are slotted, up to eleven per season');

select is(
  (select array_agg(ufc_event_id order by locks_at) from public.events where ufc_event_id::int between 301 and 314 and season_id is null),
  array['301', '302', '305'], 'pre-season and cancelled events stay unslotted'
);
select results_eq(
  $$select e.ufc_event_id, s.number, e.season_index::int from public.events e join public.seasons s on s.id = e.season_id
    where e.ufc_event_id::int between 301 and 314 order by e.locks_at$$,
  $$values ('303', 1, 1), ('304', 1, 2), ('306', 1, 3), ('307', 1, 4), ('308', 1, 5), ('309', 1, 6),
           ('310', 1, 7), ('311', 1, 8), ('312', 1, 9), ('313', 1, 10), ('314', 1, 11)$$,
  'slots follow lock order with no gap for the cancelled card'
);
select is(public.assign_season_slots(), 0, 'running again slots nothing new');
select is((select season_id from public.events where ufc_event_id = '100'), null, 'an upcoming event is not slotted');

-- One more card locks: season 1 is full, so season 2 opens with it.
do $$ begin perform public.sync_event_card(pg_temp.card('315', '2021-04-10T20:00Z', jsonb_build_array(pg_temp.bout('3015', 1, 'r3015', 'b3015')))); end $$;
select is(public.assign_season_slots(), 1, 'the twelfth locked card is slotted');
select results_eq(
  $$select s.number, s.starts_at, e.season_index::int from public.events e join public.seasons s on s.id = e.season_id
    where e.ufc_event_id = '315'$$,
  $$values (2, '2021-04-10T20:00Z'::timestamptz, 1)$$,
  'into a new season that starts when it locked'
);

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.sync_event_card(jsonb)', 'execute'), 'anon cannot sync cards');
select ok(not has_function_privilege('authenticated', 'public.sync_event_card(jsonb)', 'execute'), 'users cannot sync cards');
select ok(not has_function_privilege('authenticated', 'public.upsert_fighter(jsonb)', 'execute'), 'users cannot write fighters');
select ok(not has_function_privilege('authenticated', 'public.assign_season_slots()', 'execute'), 'users cannot assign season slots');
select ok(not has_function_privilege('authenticated', 'public.invoke_card_sync(text)', 'execute'), 'users cannot trigger a sync');
select ok(has_function_privilege('service_role', 'public.sync_event_card(jsonb)', 'execute'), 'ingestion can sync cards');

-- Ingestion runs as service_role with only the grants it is given (a hosted
-- project grants nothing by default), so exercise every write path as it.
set local role service_role;
select lives_ok(
  $$select public.sync_event_card('{"ufcEventId": "900", "name": "Card 900", "startsAt": "2099-12-05T20:00Z",
    "status": "scheduled", "issues": [], "bouts": [
      {"ufcFightId": "9001", "order": 1, "segment": "main", "scheduledRounds": 5, "weightClass": "Lightweight",
       "red": {"ufcFighterId": "r9001", "name": "Red", "nickname": null},
       "blue": {"ufcFighterId": "b9001", "name": "Blue", "nickname": null}},
      {"ufcFightId": "9002", "order": 2, "segment": "main", "scheduledRounds": 3, "weightClass": "Lightweight",
       "red": {"ufcFighterId": "r9002", "name": "Red", "nickname": null},
       "blue": {"ufcFighterId": "b9002", "name": "Blue", "nickname": null}}]}'::jsonb)$$,
  'ingestion can add a card under its own grants'
);
select lives_ok(
  $$select public.sync_event_card('{"ufcEventId": "900", "name": "Card 900 renamed", "startsAt": "2099-12-05T21:00Z",
    "status": "scheduled", "issues": [], "bouts": [
      {"ufcFightId": "9001", "order": 1, "segment": "main", "scheduledRounds": 5, "weightClass": "Lightweight",
       "red": {"ufcFighterId": "r9001", "name": "Red Renamed", "nickname": null},
       "blue": {"ufcFighterId": "x9001", "name": "Replacement", "nickname": null}}]}'::jsonb)$$,
  'and update, substitute and cancel on it'
);
select is(
  (select array_agg(b.status::text || ':' || b.version order by b.fight_order) from public.bouts b
   join public.events e on e.id = b.event_id where e.ufc_event_id = '900'),
  array['scheduled:2', 'cancelled:1'], 'with every change applied'
);
select lives_ok($$select public.assign_season_slots()$$, 'ingestion can assign season slots');
select lives_ok($$select ufc_event_id from public.events where status = 'scheduled'$$, 'ingestion can list stored events');
reset role;

select * from finish();
rollback;
