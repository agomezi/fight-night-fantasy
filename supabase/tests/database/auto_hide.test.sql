-- Auto-hiding a reported name: the third distinct established reporter on an
-- open case hides the name from everyone but its owner, who is told once;
-- new accounts don't count; a moderator is never hidden; and dismissing the
-- case brings the name back.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana owns a league everyone joins. 02 Ben is reported. 03 Cal, 04 Dee and
-- 05 Eve are established; 06 Fay signed up today.
insert into auth.users (id, email) select pg_temp.u(n), 'ah' || n || '@example.test' from generate_series(1, 6) n;
update public.profiles p set display_name = v.name, created_at = now() - interval '30 days'
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cal'), (4, 'Dee'), (5, 'Eve'), (6, 'Fay')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set created_at = now() where id = pg_temp.u(6);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create temp table lg (id uuid, code text);
grant all on lg to authenticated;

set local role authenticated;
select pg_temp.act(1);
insert into lg select public.create_league('Gym League'), null;
update lg set code = (select invite_code from public.leagues where id = lg.id);
select pg_temp.act(2); select public.join_league((select code from lg));
select pg_temp.act(3); select public.join_league((select code from lg));
select pg_temp.act(4); select public.join_league((select code from lg));
select pg_temp.act(5); select public.join_league((select code from lg));
select pg_temp.act(6); select public.join_league((select code from lg));
reset role;

-- A scored pick each: on the leaderboard, and established if old enough.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'ah1', 'name', 'Card ah1', 'startsAt', now() - interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'ah11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', 'Lightweight',
    'red', jsonb_build_object('ufcFighterId', 'ah1r', 'name', 'Red', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'ah1b', 'name', 'Blue', 'nickname', null)))));
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(n), b.id, e.season_id, 10 * n, 10 * n, '{}'::jsonb, true, true
from public.bouts b join public.events e on e.id = b.event_id, generate_series(1, 6) n
where b.ufc_fight_id = 'ah11';

create function pg_temp.report(n int) returns boolean language sql as $$
  select pg_temp.act(n);
  select public.report_league_member((select id from lg), pg_temp.u(2), 'offensive name');
$$;
create function pg_temp.ana_sees() returns text language sql as $$
  select pg_temp.act(1);
  select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2);
$$;
create function pg_temp.reviews() returns integer language sql as $$
  select count(*)::integer from public.notifications_sent
  where user_id = pg_temp.u(2) and kind = 'moderation' and payload->>'action' = 'under_review';
$$;

-------------------------------------------------------------------------------
-- Below the threshold
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.report(3);
select pg_temp.report(4);
select pg_temp.report(6);
select is(pg_temp.ana_sees(), 'Ben', 'two established reporters and a new account don''t hide a name');
reset role;
select is(pg_temp.reviews(), 0, 'and Ben isn''t told anything');

-------------------------------------------------------------------------------
-- The third established reporter
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.report(5);
select is(pg_temp.ana_sees(), 'Player', 'the third established reporter hides Ben''s name in standings');
select results_eq($$select display_name from public.season_leaderboard() where user_id = pg_temp.u(2)$$,
  $$values ('Player'::text)$$, 'on the leaderboard');
select results_eq($$select display_name from public.league_member_profile((select id from lg), pg_temp.u(2))$$,
  $$values ('Player'::text)$$, 'and on the profile card');
select ok(not exists (select 1 from public.league_matchups((select id from lg)) m
  where m.name_a = 'Ben' or m.name_b = 'Ben'), 'matchups never name him');
select results_eq($$select display_name from public.league_member_profile((select id from lg), pg_temp.u(3))$$,
  $$values ('Cal'::text)$$, 'other players are unchanged');

select pg_temp.act(2);
select results_eq($$select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2)$$,
  $$values ('Ben'::text)$$, 'Ben still sees his own name in standings');
select results_eq($$select display_name from public.season_leaderboard() where user_id = pg_temp.u(2)$$,
  $$values ('Ben'::text)$$, 'and on the leaderboard');
select results_eq($$select payload->>'action' from public.my_notifications() where kind = 'moderation'$$,
  $$values ('under_review'::text)$$, 'and has a note in his inbox saying it''s under review');

select pg_temp.report(1);
reset role;
select is(pg_temp.reviews(), 1, 'more reports don''t send the note again');

-------------------------------------------------------------------------------
-- League joins
-------------------------------------------------------------------------------

-- Ben joins another of Ana's leagues while hidden: the push names "Player".
create temp table lg2 (id uuid, code text);
grant all on lg2 to authenticated;
set local role authenticated;
select pg_temp.act(1);
insert into lg2 select public.create_league('Second League'), null;
update lg2 set code = (select invite_code from public.leagues where id = lg2.id);
select pg_temp.act(2);
select public.join_league((select code from lg2));
reset role;
select results_eq(
  $$select payload->>'member' from public.notifications_sent
    where user_id = pg_temp.u(1) and kind = 'league_join' and key like (select id from lg2) || ':%'$$,
  $$values ('Player'::text)$$, 'a join while hidden is sent as Player');

-- An older join still reads "Ben" in the table; the inbox hides it.
insert into public.notifications_sent (user_id, kind, key, payload)
values (pg_temp.u(1), 'league_join', (select id from lg) || ':' || pg_temp.u(2) || ':1',
  jsonb_build_object('league', 'Gym League', 'leagueId', (select id from lg), 'member', 'Ben'));
set local role authenticated;
select pg_temp.act(1);
select results_eq($$select payload->>'member' from public.my_notifications() where key = (select id from lg) || ':' || pg_temp.u(2) || ':1'$$,
  $$values ('Player'::text)$$, 'an older join from Ben shows as Player in Ana''s inbox');

select throws_ok($$select public.name_hidden(pg_temp.u(2))$$, '42501', null, 'players can''t probe who is hidden');
reset role;

-------------------------------------------------------------------------------
-- Moderators, and resolving the case
-------------------------------------------------------------------------------

update public.profiles set is_moderator = true where id = pg_temp.u(2);
set local role authenticated;
select is(pg_temp.ana_sees(), 'Ben', 'a moderator''s name is never hidden');
reset role;
update public.profiles set is_moderator = false where id = pg_temp.u(2);

select public.moderate((select id from public.moderation_cases where player = pg_temp.u(2) and status = 'open'), 'dismiss');
set local role authenticated;
select is(pg_temp.ana_sees(), 'Ben', 'dismissing the case brings the name back');
select pg_temp.act(1);
select results_eq($$select payload->>'member' from public.my_notifications() where key = (select id from lg) || ':' || pg_temp.u(2) || ':1'$$,
  $$values ('Ben'::text)$$, 'in the inbox too');
reset role;

-- A fresh case starts from zero: earlier reporters were used up by the
-- dismissed one, so one new report doesn't hide him.
delete from public.name_reports where reporter_id = pg_temp.u(3);
set local role authenticated;
select pg_temp.report(3);
select is(pg_temp.ana_sees(), 'Ben', 'a new case counts only its own reporters');
reset role;

-- A reset clears the name, so there's nothing left to hide.
select public.moderate((select id from public.moderation_cases where player = pg_temp.u(2) and status = 'open'), 'reset_name');
select is((select display_name from public.profiles where id = pg_temp.u(2)), null, 'a reset makes him pick a new name');
select ok(not exists (select 1 from public.moderation_cases where player = pg_temp.u(2) and status = 'open'),
  'and closes the case, so his next name isn''t hidden');

select * from finish();
rollback;
