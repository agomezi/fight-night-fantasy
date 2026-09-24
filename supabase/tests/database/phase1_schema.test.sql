-- Phase 1 schema: an event, bouts, picks and results inserted by hand, and the
-- rules that have to hold between them. Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-------------------------------------------------------------------------------
-- Fixtures: DWCS 10.7, two bouts, two users
-------------------------------------------------------------------------------

insert into public.seasons (id, number) values
  ('00000000-0000-0000-0000-00000000005e', 1);

insert into public.events (id, name, starts_at, locks_at, season_id, season_index) values
  ('00000000-0000-0000-0000-0000000000e1', 'DWCS 10.7',
   '2026-09-22 23:00Z', '2026-09-22 23:00Z', '00000000-0000-0000-0000-00000000005e', 1);

insert into public.fighters (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Paris Moran'),
  ('00000000-0000-0000-0000-0000000000f2', 'Degli'),
  ('00000000-0000-0000-0000-0000000000f3', 'Norbert Novenyi Jr.'),
  ('00000000-0000-0000-0000-0000000000f4', 'Theo Haig'),
  ('00000000-0000-0000-0000-0000000000f5', 'Short-notice replacement');

insert into public.bouts
  (id, event_id, fight_order, card_segment, scheduled_rounds, red_fighter_id, blue_fighter_id) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e1', 3, 'main', 3,
   '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 1, 'main', 3,
   '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'bob@example.test');

-------------------------------------------------------------------------------
-- Profiles
-------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.profiles),
  2,
  'signing up creates a profile'
);

-------------------------------------------------------------------------------
-- Picks
-------------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 1,
             '00000000-0000-0000-0000-0000000000f1', 'round', 2, 'SUB') $$,
  'a complete pick inserts'
);

select lives_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b3', 1,
             '00000000-0000-0000-0000-0000000000f2', 'ANY') $$,
  'a pick with no round named inserts'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
             '00000000-0000-0000-0000-0000000000f1', 'DEC') $$,
  'P0001', null,
  'a fighter who is not in the bout cannot be picked'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, method)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
             '00000000-0000-0000-0000-0000000000f3', 'DEC', 'KO') $$,
  '23514', null,
  'a decision pick cannot also name a method'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
             '00000000-0000-0000-0000-0000000000f3', 'round', 4) $$,
  'P0001', null,
  'a round beyond the scheduled distance cannot be picked'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
             '00000000-0000-0000-0000-0000000000f3', 'round') $$,
  '23514', null,
  'a round pick must name the round'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 1,
             '00000000-0000-0000-0000-0000000000f2', 'ANY') $$,
  '23505', null,
  'one pick per user per bout'
);

-------------------------------------------------------------------------------
-- Substitutions
-------------------------------------------------------------------------------

update public.bouts
   set blue_fighter_id = '00000000-0000-0000-0000-0000000000f5'
 where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select version from public.bouts where id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'replacing a fighter bumps the bout version'
);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
             '00000000-0000-0000-0000-0000000000f3', 'DEC') $$,
  'P0001', null,
  'a pick against a superseded bout version is rejected'
);

update public.bouts
   set blue_fighter_id = '00000000-0000-0000-0000-0000000000f4'
 where id = '00000000-0000-0000-0000-0000000000b1';

-------------------------------------------------------------------------------
-- Results
-------------------------------------------------------------------------------

-- The feed first published round 3, then corrected it to round 2.
select lives_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, round, time, source)
     values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f1',
             'SUB', 3, '4:46', 'ufc_live') $$,
  'a provisional result inserts'
);

update public.results
   set round = 2, status = 'final'
 where bout_id = '00000000-0000-0000-0000-0000000000b3';

select is(
  (select array_agg(round order by id) from public.result_revisions
    where bout_id = '00000000-0000-0000-0000-0000000000b3'),
  array[3, 2]::smallint[],
  'a corrected result keeps both versions in its history'
);

select throws_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, round, source)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
             'DEC', 3, 'ufc_live') $$,
  '23514', null,
  'a decision names no round'
);

select throws_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, source)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
             'KO', 'ufc_live') $$,
  '23514', null,
  'a finish must name its round'
);

select throws_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, round, source)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
             'KO', 1, 'ufc_live') $$,
  'P0001', null,
  'the winner must be in the bout'
);

select throws_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, void_reason, source)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
             'DEC', 'NC', 'ufc_live') $$,
  '23514', null,
  'a result is either scored or void, not both'
);

-- A human sets the main event result; the feed later disagrees.
insert into public.results (bout_id, winner_fighter_id, method, source, manual_override, status)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
        'DEC', 'manual', true, 'final');

update public.results
   set winner_fighter_id = '00000000-0000-0000-0000-0000000000f4', source = 'ufc_live'
 where bout_id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select winner_fighter_id from public.results where bout_id = '00000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-0000000000f3'::uuid,
  'the feed cannot overwrite a manual correction'
);

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.bouts),
  2,
  'anyone can read bouts'
);

select is(
  (select count(*)::int from public.results),
  2,
  'anyone can read results'
);

select throws_ok(
  $$ select * from public.picks $$,
  '42501', null,
  'a signed-out visitor cannot read picks'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select is(
  (select array_agg(user_id) from public.picks),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'a user sees only their own picks'
);

-- Version 3: the replacement and the reversal each bumped it.
select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 3,
             '00000000-0000-0000-0000-0000000000f3', 'DEC') $$,
  '42501', null,
  'a user cannot place a pick for someone else'
);

select throws_ok(
  $$ insert into public.results (bout_id, winner_fighter_id, method, source)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
             'DEC', 'manual') $$,
  '42501', null,
  'a user cannot write results'
);

select throws_ok(
  $$ select * from public.result_revisions $$,
  '42501', null,
  'result history is not exposed to clients'
);

reset role;

select * from finish();
rollback;
