-- A league's rules by invite code, read before joining: what it returns for
-- Pro and Casual, the rotation count in and out of a season, queued and full,
-- already-a-member, unknown codes, and that it needs a signed-in player and
-- never names anyone. Then which of your leagues have had a card lock.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lp1', 'name', 'UFC Fight Night: Lp vs. One', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'lp1' || o, 'order', o,
      'segment', case when o <= 2 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'lp1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'lp1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 4) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.pro() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d1'::uuid $$;
create function pg_temp.casual() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d2'::uuid $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true)
$$;

-- A card that locked yesterday, for my_leagues_started.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lp0', 'name', 'UFC Fight Night: Lp vs. Zero', 'startsAt', now() - interval '1 day', 'status', 'complete',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'lp01', 'order', 1,
    'segment', 'main', 'scheduledRounds', 3, 'weightClass', null,
    'red', jsonb_build_object('ufcFighterId', 'lp0r1', 'name', 'Red Zero', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'lp0b1', 'name', 'Blue Zero', 'nickname', null)))));

insert into auth.users (id, email) select pg_temp.u(n), 'lp' || n || '@example.test' from generate_series(1, 20) n;
update public.profiles p set display_name = 'Previewer' || v.n from generate_series(1, 20) v(n) where p.id = pg_temp.u(v.n);

insert into public.leagues (id, name, owner_id, tier, invite_code, created_at)
values (pg_temp.pro(), 'Preview Pro', pg_temp.u(1), 'pro', 'prev0pro', now() - interval '3 days'),
       (pg_temp.casual(), 'Preview Easy', pg_temp.u(1), 'casual', 'prev0cas', now()),
       ('00000000-0000-0000-0000-0000000000d3', 'Preview Full', pg_temp.u(7), 'amateur', 'prev0ful', now());
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000d3', pg_temp.u(n) from generate_series(7, 18) n;
-- Pro: 01-05, with 05 gone. Casual: 01 only.
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.pro(), pg_temp.u(n), now() - interval '3 days' from generate_series(1, 5) n;
update public.league_members set left_at = now() where league_id = pg_temp.pro() and user_id = pg_temp.u(5);
insert into public.league_members (league_id, user_id, joined_at)
values (pg_temp.casual(), pg_temp.u(1), now() - interval '3 days');
-- Pro's owner set top 3 before the card.
insert into public.league_pick_rules (league_id, effective_at, scope, top_n)
values (pg_temp.pro(), clock_timestamp(), 'top_n', 3);

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.league_preview(text)', 'execute'),
  'authenticated can preview a league');
select ok(not has_function_privilege('anon', 'public.league_preview(text)', 'execute'),
  'anon cannot');

-------------------------------------------------------------------------------
-- As a player who isn't in either league
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user(6);

select results_eq(
  $$ select name, tier::text, members, max_members, scope, top_n::int, already_member from public.league_preview('prev0pro') $$,
  $$ values ('Preview Pro'::text, 'pro'::text, 4, 12, 'top_n'::text, 3, false) $$,
  'a Pro league shows its name, tier, members and the minimum for the next card');
select results_eq(
  $$ select queued, is_full from public.league_preview('prev0pro') $$,
  $$ values (false, false) $$,
  'in pre-season, joining is not queued');
select ok((select is_full from public.league_preview('prev0ful')), 'a league of 12 is full');
select results_eq(
  $$ select scope, top_n::int from public.league_preview('prev0cas') $$,
  $$ values (null::text, null::int) $$,
  'a Casual league has no owner-set minimum');
select is((select members from public.league_preview('prev0cas')), 1, 'Casual counts its one member');
select is((select count(*)::int from public.league_preview('  PREV0PRO ')), 1,
  'the code is matched like join_league: trimmed, any case');
select is((select count(*)::int from public.league_preview('nope1234')), 0, 'an unknown code returns no row');
select is((select count(*)::int from public.league_preview(null)), 0, 'a null code returns no row');
select ok(not exists (
  select 1 from public.league_preview('prev0pro') p
  where p.name like 'Previewer%' or p.scope like 'Previewer%'),
  'nothing returned names a member');

-------------------------------------------------------------------------------
-- As members, past and present
-------------------------------------------------------------------------------

select pg_temp.as_user(2);
select ok((select already_member from public.league_preview('prev0pro')), 'a current member is told they are in');
select pg_temp.as_user(5);
select ok(not (select already_member from public.league_preview('prev0pro')), 'someone who left is not');

-------------------------------------------------------------------------------
-- Which leagues have started
-------------------------------------------------------------------------------

select pg_temp.as_user(1);
select results_eq(
  $$ select league_id, started from public.my_leagues_started() order by league_id $$,
  $$ values (pg_temp.pro(), true), (pg_temp.casual(), false) $$,
  'a league made before a locked card has started; one made since has not');
select ok(has_function_privilege('authenticated', 'public.my_leagues_started()', 'execute')
  and not has_function_privilege('anon', 'public.my_leagues_started()', 'execute'),
  'authenticated can read which leagues started, anon cannot');

-------------------------------------------------------------------------------
-- Signed out, and the default rule
-------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$ select * from public.league_preview('prev0pro') $$, 'P0001', 'Sign in first.',
  'a request with no player is refused');

reset role;
delete from public.league_pick_rules where league_id = pg_temp.pro() and scope = 'top_n';
set local role authenticated;
select pg_temp.as_user(6);
select is((select scope from public.league_preview('prev0pro')), 'main_card',
  'a Pro league that kept the default shows the main card');

-------------------------------------------------------------------------------
-- During a season
-------------------------------------------------------------------------------

reset role;
insert into public.seasons (number, starts_at) values (99, now() - interval '1 day');
update public.league_members
set status = case when user_id = pg_temp.u(4) then 'queued' else 'active' end::public.membership_status
where league_id = pg_temp.pro();
set local role authenticated;
select pg_temp.as_user(6);
select results_eq(
  $$ select members, queued from public.league_preview('prev0pro') $$,
  $$ values (3, true) $$,
  'in a season only active members count, and joining is queued');

select * from finish();
rollback;
