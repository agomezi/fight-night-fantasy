-- Account deletion: what a deleted account leaves behind, what goes at once,
-- and what the season rollover purge removes. Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-------------------------------------------------------------------------------
-- Fixtures: one locked card, one upcoming card, three users, three leagues
-------------------------------------------------------------------------------

insert into public.seasons (id, number) values
  ('00000000-0000-0000-0000-00000000005e', 1);

insert into public.events (id, name, starts_at, locks_at, season_id, season_index) values
  ('00000000-0000-0000-0000-0000000000e1', 'Locked card',
   '2026-09-22 23:00Z', '2026-09-22 23:00Z', '00000000-0000-0000-0000-00000000005e', 1),
  ('00000000-0000-0000-0000-0000000000e2', 'Upcoming card',
   '2099-01-01 23:00Z', '2099-01-01 23:00Z', '00000000-0000-0000-0000-00000000005e', 2);

insert into public.fighters (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Red'),
  ('00000000-0000-0000-0000-0000000000f2', 'Blue');

insert into public.bouts
  (id, event_id, fight_order, card_segment, red_fighter_id, blue_fighter_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 1, 'main',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e2', 1, 'main',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'bob@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'carol@example.test');

insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('apple-alice', '00000000-0000-0000-0000-0000000000a1', '{"email": "alice@example.test"}', 'apple');

update public.profiles set display_name = 'Alice' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Bob'   where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set display_name = 'Carol' where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
   '00000000-0000-0000-0000-0000000000f1', 'DEC'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 1,
   '00000000-0000-0000-0000-0000000000f1', 'DEC'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 1,
   '00000000-0000-0000-0000-0000000000f2', 'DEC');

insert into public.scores (user_id, bout_id, season_id, points, breakdown, correct, counts_for_accuracy) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-00000000005e', 100, '{}', true, true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-00000000005e', 0, '{}', false, true);

-- L1: Alice owns it. Bob joined before Carol but is only queued.
-- L2: Alice owns it and is its only member.
-- L3: Bob owns it; Alice is queued for next season.
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Shared',   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', 'Solo',     '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c3', 'Bob''s',   '00000000-0000-0000-0000-0000000000a2');

insert into public.league_members (league_id, user_id, status, joined_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'active', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'queued', '2026-09-02'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', 'active', '2026-09-03'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'active', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a2', 'active', '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'queued', '2026-09-10');

-------------------------------------------------------------------------------
-- Who can call what
-------------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.delete_account() $$,
  '42501', null,
  'a signed-out visitor cannot call delete_account'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);

select throws_ok(
  $$ select public.purge_deleted_accounts() $$,
  '42501', null,
  'a user cannot run the season purge'
);

select throws_ok(
  $$ update public.profiles set deleted_at = now() where id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501', null,
  'a user can change only their display name'
);

-------------------------------------------------------------------------------
-- Alice deletes her account
-------------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.delete_account() $$,
  'a signed-in user can delete their account'
);

reset role;

select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the auth user and its email are gone'
);

select is(
  (select count(*)::int from auth.identities where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the login identities are gone'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  null,
  'the display name is erased'
);

select isnt(
  (select deleted_at from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  null,
  'a tombstone profile remains'
);

select is(
  (select count(*)::int from public.picks
    where user_id = '00000000-0000-0000-0000-0000000000a1'
      and bout_id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'a pick on a locked card stays for the season'
);

select is(
  (select count(*)::int from public.scores where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'scores stay for the season'
);

select is(
  (select count(*)::int from public.picks
    where user_id = '00000000-0000-0000-0000-0000000000a1'
      and bout_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'a pick on a card that has not locked is removed'
);

select is(
  (select status::text from public.league_members
    where league_id = '00000000-0000-0000-0000-0000000000c1'
      and user_id = '00000000-0000-0000-0000-0000000000a1'),
  'active',
  'an active membership stays for the season'
);

select is(
  (select count(*)::int from public.league_members
    where league_id = '00000000-0000-0000-0000-0000000000c3'
      and user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'a queued membership is removed'
);

select is(
  (select owner_id from public.leagues where id = '00000000-0000-0000-0000-0000000000c1'),
  '00000000-0000-0000-0000-0000000000a3'::uuid,
  'ownership passes to the longest-standing active member'
);

select is(
  (select count(*)::int from public.leagues where id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'a league with no one else in it is deleted'
);

select is(
  (select count(*)::int from public.profiles
    where id <> '00000000-0000-0000-0000-0000000000a1' and deleted_at is null),
  2,
  'other accounts are untouched'
);

-------------------------------------------------------------------------------
-- Alice's access token is still valid for a while
-------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select throws_ok(
  $$ insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 1,
             '00000000-0000-0000-0000-0000000000f2', 'DEC') $$,
  '42501', null,
  'a deleted account cannot place picks'
);

delete from public.picks where user_id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Back again' where id = '00000000-0000-0000-0000-0000000000a1';

reset role;

select is(
  (select count(*)::int from public.picks where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'a deleted account cannot remove picks from the standings'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  null,
  'a deleted account cannot rename its tombstone'
);

select throws_ok(
  $$ update public.profiles set display_name = 'Alice' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'a tombstone cannot carry a name'
);

-------------------------------------------------------------------------------
-- An admin deletes Bob from the dashboard
-------------------------------------------------------------------------------

delete from auth.users where id = '00000000-0000-0000-0000-0000000000a2';

select isnt(
  (select deleted_at from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  null,
  'deleting the auth user directly also leaves a tombstone'
);

select is(
  (select count(*)::int from public.leagues where id = '00000000-0000-0000-0000-0000000000c3'),
  0,
  'a league whose other members are all deleted is deleted too'
);

-------------------------------------------------------------------------------
-- Season rollover
-------------------------------------------------------------------------------

set local role service_role;

select is(
  public.purge_deleted_accounts(),
  2,
  'the purge reports how many accounts it removed'
);

reset role;

select is(
  (select array_agg(id) from public.profiles),
  array['00000000-0000-0000-0000-0000000000a3']::uuid[],
  'purged tombstones are gone'
);

select is(
  (select count(*)::int from public.picks),
  0,
  'their picks are gone'
);

select is(
  (select count(*)::int from public.scores),
  0,
  'their scores are gone'
);

select is(
  (select array_agg(user_id) from public.league_members
    where league_id = '00000000-0000-0000-0000-0000000000c1'),
  array['00000000-0000-0000-0000-0000000000a3']::uuid[],
  'the league carries on with the remaining members'
);

select is(
  (select owner_id from public.leagues where id = '00000000-0000-0000-0000-0000000000c1'),
  '00000000-0000-0000-0000-0000000000a3'::uuid,
  'the surviving league keeps its new owner'
);

select * from finish();
rollback;
