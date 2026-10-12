-- The main card reminder: 30 minutes before the main card locks, once, with
-- the count of main card fights still unpicked; never for a card whose main
-- card is its first section, and never once it has locked.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

-- m1: prelims started an hour ago, the main card locks in 20 minutes.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'm1', 'name', 'UFC Fight Night: Main vs. Card', 'startsAt', now() + interval '3 hours',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    pg_temp.bout('m11', 1, 'main'), pg_temp.bout('m12', 2, 'main'), pg_temp.bout('m13', 3, 'main'),
    pg_temp.bout('m14', 4, 'prelims'))));
-- m2: main card only, locking in 20 minutes; the hour-out reminder covers it.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'm2', 'name', 'UFC 997: Only vs. Main', 'startsAt', now() + interval '20 minutes',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(pg_temp.bout('m21', 1, 'main'))));

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'eve@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'fin@example.test');
-- Eve picked the main event and the prelim; two main card fights are left.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish) values
  ('00000000-0000-0000-0000-0000000000e1', pg_temp.bid('m11'), 1, pg_temp.fid('m11r'), 'ANY'),
  ('00000000-0000-0000-0000-0000000000e1', pg_temp.bid('m14'), 1, pg_temp.fid('m14r'), 'ANY');
insert into public.push_tokens (token, user_id) values
  ('ExponentPushToken[eve-phone]', '00000000-0000-0000-0000-0000000000e1'),
  ('ExponentPushToken[fin-phone]', '00000000-0000-0000-0000-0000000000e2');
-- Fin turned reminders off.
update public.profiles set notify_reminders = false where id = '00000000-0000-0000-0000-0000000000e2';

update public.events set status = 'live', locks_at = now() - interval '1 hour' where id = pg_temp.ev('m1');
update public.bouts set locks_at = now() - interval '1 hour' where id = pg_temp.bid('m14');
update public.bouts set locks_at = now() + interval '20 minutes' where event_id = pg_temp.ev('m1') and card_segment = 'main';
-- m2 already had its hour-out reminder.
insert into public.notifications_sent (user_id, kind, key)
select u, 'reminder', pg_temp.ev('m2')::text
from unnest(array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2']::uuid[]) u;

create temp table got as select * from public.claim_reminders();

select results_eq(
  $$select user_id, payload->>'section', (payload->>'missing')::int, (payload->>'minutes')::int, wanted from got order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000e1'::uuid, 'main', 2, 20, true),
           ('00000000-0000-0000-0000-0000000000e2'::uuid, 'main', 3, 20, false)$$,
  '30 minutes out, the main card reminder counts each player''s unpicked main card fights'
);
select is((select count(*)::int from public.notifications_sent where key = pg_temp.ev('m1') || ':main'), 2,
  'it is recorded as sent, toggle off or not');
select is((select count(*)::int from public.claim_reminders()), 0, 'and only sent once');
select is((select count(*)::int from got where payload->>'event' = 'UFC 997: Only vs. Main'), 0,
  'a card whose main card is its first section gets no second reminder');
select is((select count(*)::int from public.notifications_sent where kind = 'reminder' and key = pg_temp.ev('m1')::text), 0,
  'a card that already started locking gets no hour-out reminder');

-- Once the main card has locked there is nothing to remind about.
delete from public.notifications_sent where key = pg_temp.ev('m1') || ':main';
update public.bouts set locks_at = now() - interval '1 minute' where event_id = pg_temp.ev('m1') and card_segment = 'main';
select is((select count(*)::int from public.claim_reminders()), 0, 'no reminder once the main card has locked');

-- Too early: an hour out is still the other reminder's job.
update public.bouts set locks_at = now() + interval '60 minutes' where event_id = pg_temp.ev('m1') and card_segment = 'main';
select is((select count(*)::int from public.claim_reminders()), 0, 'no main card reminder more than 30 minutes out');

select * from finish();
rollback;
