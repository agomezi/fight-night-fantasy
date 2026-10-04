-- Notifications: tokens, reminders, score and recap claims (each sent once,
-- corrections sent again), preferences, and deletion clearing it all.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
-- A card that starts locking in 30 minutes.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'n1', 'name', 'UFC 999: Red vs. Blue', 'startsAt', now() + interval '30 minutes',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    jsonb_build_object('ufcFightId', 'n11', 'order', 1, 'segment', 'main', 'scheduledRounds', 5,
      'weightClass', null, 'red', pg_temp.f('nr1'), 'blue', pg_temp.f('nb1')),
    jsonb_build_object('ufcFightId', 'n12', 'order', 2, 'segment', 'main', 'scheduledRounds', 3,
      'weightClass', null, 'red', pg_temp.f('nr2'), 'blue', pg_temp.f('nb2')))));

create function pg_temp.bid(fight text) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = fight $$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'n1' $$;
create function pg_temp.fid(u text) returns uuid language sql as $$ select id from public.fighters where ufc_fighter_id = u $$;
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c8', 'cam@example.test'),
  ('00000000-0000-0000-0000-0000000000d8', 'dee@example.test');
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
values ('00000000-0000-0000-0000-0000000000c8', pg_temp.bid('n11'), 1, pg_temp.fid('nr1'), 'ANY');

-------------------------------------------------------------------------------
-- Tokens
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c8');
select public.register_push_token('ExponentPushToken[cam-phone]', 'ios');
update public.profiles set notify_summary = false where id = '00000000-0000-0000-0000-0000000000c8';
select throws_ok($$select * from public.push_tokens$$, '42501', null, 'players cannot read tokens');
select throws_ok($$select * from public.claim_reminders()$$, '42501', null, 'players cannot claim notifications');
reset role;

select is((select user_id from public.push_tokens where token = 'ExponentPushToken[cam-phone]'),
  '00000000-0000-0000-0000-0000000000c8'::uuid, 'a phone registers its token');
select is((select notify_summary from public.profiles where id = '00000000-0000-0000-0000-0000000000c8'), false,
  'players can set their own notification preferences');

-------------------------------------------------------------------------------
-- Reminders
-------------------------------------------------------------------------------

select results_eq(
  $$select user_id, payload->>'event', (payload->>'hasMainPick')::boolean, tokens, wanted from public.claim_reminders()$$,
  $$values ('00000000-0000-0000-0000-0000000000c8'::uuid, 'UFC 999: Red vs. Blue', true,
            array['ExponentPushToken[cam-phone]'], true)$$,
  'an hour out, players with a phone get a reminder; players without one do not'
);
select is((select count(*)::int from public.claim_reminders()), 0, 'a reminder is only sent once');

-------------------------------------------------------------------------------
-- Scores
-------------------------------------------------------------------------------

update public.events set status = 'live', starts_at = now() - interval '1 hour', locks_at = now() - interval '1 hour' where id = pg_temp.ev();
update public.bouts set locks_at = now() - interval '1 hour' where event_id = pg_temp.ev();
insert into public.results (bout_id, status, winner_fighter_id, method, round, time, source)
values (pg_temp.bid('n11'), 'provisional', pg_temp.fid('nr1'), 'KO', 2, '3:41', 'ufc_live');
insert into public.scores (user_id, bout_id, points, breakdown, correct, counts_for_accuracy, provisional)
values ('00000000-0000-0000-0000-0000000000c8', pg_temp.bid('n11'), 50, '{}', true, true, true);

create temp table first_claim as select * from public.claim_event_notifications(pg_temp.ev());
select results_eq(
  $$select kind, (payload->>'points')::int, payload->>'winner', payload->>'loser', payload->>'method',
           (payload->>'round')::int, (payload->>'correction')::boolean, wanted from first_claim$$,
  $$values ('scored', 50, 'Fighter nr1', 'Fighter nb1', 'KO', 2, false, true)$$,
  'a scored fight is claimed with its result and points'
);
select is((select count(*)::int from public.claim_event_notifications(pg_temp.ev())), 0, 'it is only sent once');

-- The result turns final with the same points: nothing new to say.
update public.results set status = 'final' where bout_id = pg_temp.bid('n11');
update public.scores set provisional = false where bout_id = pg_temp.bid('n11');
select is((select count(*)::int from public.claim_event_notifications(pg_temp.ev())), 0,
  'turning final without changing the points sends nothing');

-- A correction changes the points.
update public.scores set points = 125 where bout_id = pg_temp.bid('n11');
select results_eq(
  $$select kind, (payload->>'points')::int, (payload->>'correction')::boolean from public.claim_event_notifications(pg_temp.ev())$$,
  $$values ('scored', 125, true)$$,
  'a correction that changes the points is sent again, marked as a correction'
);

-------------------------------------------------------------------------------
-- The recap
-------------------------------------------------------------------------------

update public.events set status = 'complete' where id = pg_temp.ev();
select is((select count(*)::int from public.claim_event_notifications(pg_temp.ev())), 0,
  'no recap while a bout still has no final result');

insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
values (pg_temp.bid('n12'), 'final', pg_temp.fid('nb2'), 'DEC', null, 'ufc_live');
select results_eq(
  $$select kind, (payload->>'points')::int, (payload->>'hit')::int, (payload->>'total')::int, wanted
    from public.claim_event_notifications(pg_temp.ev())$$,
  $$values ('final', 125, 1, 1, false)$$,
  'the recap is claimed once the card is final, and respects a player who turned recaps off'
);
select is((select count(*)::int from public.claim_event_notifications(pg_temp.ev())), 0, 'the recap is only sent once');

-------------------------------------------------------------------------------
-- Moving phones, dead tokens, deletion
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d8');
select public.register_push_token('ExponentPushToken[cam-phone]', 'ios');
reset role;
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[cam-phone]'),
  '00000000-0000-0000-0000-0000000000d8'::uuid, 'signing in with another account takes the phone over');

set local role authenticated;
select public.unregister_push_token('ExponentPushToken[cam-phone]');
reset role;
select is((select count(*)::int from public.push_tokens), 0, 'signing out removes the phone');

insert into public.push_tokens (token, user_id) values ('ExponentPushToken[dead-phone]', '00000000-0000-0000-0000-0000000000c8');
select public.remove_push_tokens(array['ExponentPushToken[dead-phone]']);
select is((select count(*)::int from public.push_tokens), 0, 'tokens Expo rejects are removed');

insert into public.push_tokens (token, user_id) values ('ExponentPushToken[cam-again]', '00000000-0000-0000-0000-0000000000c8');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c8');
select public.delete_account();
reset role;
select is((select count(*)::int from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000000c8'), 0,
  'deleting an account removes its phones');
select is((select count(*)::int from public.notifications_sent where user_id = '00000000-0000-0000-0000-0000000000c8'), 0,
  'and its notification record');

select is(
  (select count(*)::int from cron.job where jobname = 'lock-reminders'),
  1,
  'reminders are scheduled'
);
select ok(
  exists (select 1 from information_schema.column_privileges
          where table_name = 'profiles' and column_name = 'notify_results'
            and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  'players can update their notification preferences'
);

select * from finish();
rollback;
