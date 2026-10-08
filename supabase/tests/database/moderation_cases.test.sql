-- Moderation: every report is in one case, each decision is logged and
-- carried out, a suspended player can look but not play until it ends, a
-- banned player leaves every table and can't sign in, lift restores them,
-- the player is told, and only moderators can decide or read any of it.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana and 02 Ben report 03 Cal. 04 Moe is a moderator. 05 Dee owns a
-- league Cal is in.
insert into auth.users (id, email) select pg_temp.u(n), 'mc' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cal'), (4, 'Moe'), (5, 'Dee')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set is_moderator = true where id = pg_temp.u(4);

insert into public.leagues (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000aa', 'Gym League', pg_temp.u(5)),
       ('00000000-0000-0000-0000-0000000000cc', 'Cal League', pg_temp.u(3));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000aa'::uuid, pg_temp.u(n) from generate_series(1, 5) n
union all
select '00000000-0000-0000-0000-0000000000cc'::uuid, pg_temp.u(n) from unnest(array[3, 5]) n;

-- A card two days out, and a scored pick for Cal this season.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'mc1', 'name', 'Card mc1', 'startsAt', now() + interval '2 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'mc11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', 'Lightweight',
    'red', jsonb_build_object('ufcFighterId', 'mc1r', 'name', 'Red', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'mc1b', 'name', 'Blue', 'nickname', null)))));
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(3), b.id, e.season_id, 50, 50, '{}'::jsonb, true, true
from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = 'mc11';

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.report(n int, reason text) returns boolean language sql as $$
  select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(3), reason)
$$;
create function pg_temp.pick() returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(3), b.id, b.version, b.red_fighter_id, 'ANY' from public.bouts b where b.ufc_fight_id = 'mc11'
  on conflict (user_id, bout_id) do update set picked_fighter_id = excluded.picked_fighter_id
$$;
create function pg_temp.case_of(n int) returns bigint language sql as $$
  select case_id from public.name_reports where reporter_id = pg_temp.u(n) and reported_id = pg_temp.u(3)
$$;
create function pg_temp.standing() returns text language sql as $$
  select standing from public.player_standing(pg_temp.u(3))
$$;
create function pg_temp.notices() returns text[] language sql as $$
  select coalesce(array_agg(payload->>'action' order by split_part(key, ':', 2)::bigint), '{}') from public.notifications_sent
  where user_id = pg_temp.u(3) and kind = 'moderation'
$$;

-------------------------------------------------------------------------------
-- Cases
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select pg_temp.report(1, 'offensive name');
select pg_temp.act(2);
select pg_temp.report(2, 'impersonation');
reset role;

-- The first case's id, readable while acting as a player.
create temp table first_case as select pg_temp.case_of(1) as id;
grant select on first_case to authenticated;

select isnt(pg_temp.case_of(1), null, 'a report opens a case');
select is(pg_temp.case_of(2), pg_temp.case_of(1), 'a second report joins the open case');
select results_eq($$select player, status from public.moderation_cases$$, $$values (pg_temp.u(3), 'open'::text)$$,
  'one open case for the player');
select results_eq($$select case_id, reporters, strikes, standing from public.open_cases$$,
  $$values (pg_temp.case_of(1), 2::bigint, 0, 'active'::text)$$, 'open_cases lists it for the SQL editor');

-------------------------------------------------------------------------------
-- Who can decide
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select throws_ok(format('select * from public.moderate(%s, %L)', (select id from first_case), 'dismiss'), '42501', null,
  'a player can''t moderate');
select throws_ok($$select * from public.moderation_cases$$, '42501', null, 'or read cases');
select throws_ok($$select * from public.moderation_actions$$, '42501', null, 'or actions');
select throws_ok($$select * from public.open_cases$$, '42501', null, 'or the open cases view');
select throws_ok($$select * from public.player_standing(pg_temp.u(3))$$, '42501', null, 'or anyone''s standing');
select pg_temp.act(3);
select results_eq($$select standing, until from public.my_standing()$$, $$values ('active'::text, null::timestamptz)$$,
  'a player can read their own standing');
reset role;

-------------------------------------------------------------------------------
-- Warn, from the app, by a moderator
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(4);
select results_eq(
  format('select standing, strikes from public.moderate(%s, %L, %L, %L)', (select id from first_case), 'warn', 'Offensive name', 'first time'),
  $$values ('active'::text, 1)$$, 'a moderator warns: one strike, still active');
reset role;

select results_eq($$select action, reason, note, moderator from public.moderation_actions$$,
  $$values ('warn'::text, 'Offensive name'::text, 'first time'::text, pg_temp.u(4))$$, 'the warning is logged');
select results_eq($$select status, resolved_by from public.moderation_cases$$, $$values ('actioned'::text, pg_temp.u(4))$$,
  'and the case is closed as actioned');
select results_eq(
  $$select payload, pushed from public.notifications_sent where user_id = pg_temp.u(3) and kind = 'moderation'$$,
  $$values ('{"action": "warn", "reason": "Offensive name"}'::jsonb, false)$$,
  'the player is sent a notice with the reason, but not the note'
);
select throws_ok(format('select * from public.moderate(%s, %L)', (select id from first_case), 'dismiss'), 'P0001', null,
  'an actioned case can''t then be dismissed');
select throws_ok($$select * from public.moderate(999999, 'warn')$$, 'P0001', 'There''s no case 999999.', 'an unknown case is refused');
select throws_ok(format('select * from public.moderate(%s, %L)', pg_temp.case_of(1), 'lift'), 'P0001',
  'The player isn''t suspended or banned.', 'nothing to lift on an active player');

-- League activity off: a moderation notice still pushes.
update public.profiles set notify_league_activity = false where id = pg_temp.u(3);
set local role service_role;
select results_eq($$select kind, wanted from public.claim_activity_notifications() where user_id = pg_temp.u(3)$$,
  $$values ('moderation'::text, true)$$, 'a moderation notice is pushed whatever the player''s settings');
reset role;

-------------------------------------------------------------------------------
-- A new report opens a new case
-------------------------------------------------------------------------------

delete from public.name_reports where reporter_id = pg_temp.u(1);
set local role authenticated;
select pg_temp.act(1);
select pg_temp.report(1, 'offensive name');
reset role;
select isnt(pg_temp.case_of(1), pg_temp.case_of(2), 'a report after the case closed opens a new one');

-------------------------------------------------------------------------------
-- Reset and suspend, from the SQL editor
-------------------------------------------------------------------------------

-- The SQL editor runs with no signed-in player.
select set_config('request.jwt.claims', '', true);

select results_eq(format('select strikes from public.moderate(%s, %L, %L)', pg_temp.case_of(1), 'reset_name', 'Offensive name'),
  $$values (2)$$, 'resetting the name on a second case is a second strike');
select is((select display_name from public.profiles where id = pg_temp.u(3)), null, 'the name is cleared');
select is((select moderator from public.moderation_actions where action = 'reset_name'), null,
  'run from the SQL editor, it records no moderator');

update public.profiles set display_name = 'Cal' where id = pg_temp.u(3);
select results_eq(
  format('select standing, until > now() + interval ''6 days'' from public.moderate(%s, %L, %L, null, interval ''7 days'')',
    pg_temp.case_of(1), 'suspend', 'Repeated offensive names'),
  $$values ('suspended'::text, true)$$, 'a suspension for seven days');
select is((pg_temp.notices())[3], 'suspend', 'the player is told');
select ok((select payload ? 'until' from public.notifications_sent where kind = 'moderation' and payload->>'action' = 'suspend'),
  'with when it ends');
select throws_ok(format('select * from public.moderate(%s, %L)', pg_temp.case_of(1), 'suspend'), 'P0001', null,
  'a suspension needs a duration');

-------------------------------------------------------------------------------
-- What a suspended player can't do
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(3);
select throws_ok($$select pg_temp.pick()$$, 'P0001', null, 'a suspended player can''t pick');
select throws_like($$select pg_temp.pick()$$, 'Your account is suspended until %', 'and is told until when');
select throws_ok($$select public.create_league('New')$$, 'P0001', null, 'or create a league');
select throws_ok($$select public.join_league((select invite_code from public.leagues where name = 'Gym League'))$$, 'P0001', null,
  'or join one');
select throws_ok($$select public.report_display_name(pg_temp.u(1), 'offensive name')$$, 'P0001', null, 'or report');
select throws_ok($$update public.profiles set display_name = 'Calvin' where id = pg_temp.u(3)$$, 'P0001', null,
  'or rename');
select results_eq($$select standing from public.my_standing()$$, $$values ('suspended'::text)$$, 'and can see they''re suspended');
reset role;

select is(public.league_display_name(pg_temp.u(3)), 'Suspended', 'leagues show them as Suspended');
select results_eq($$select display_name from public.season_leaderboard() where user_id = pg_temp.u(3)$$,
  $$values ('Suspended'::text)$$, 'and so does the leaderboard');

-- With no name, as after a reset, they can still take one.
update public.profiles set display_name = null where id = pg_temp.u(3);
set local role authenticated;
select pg_temp.act(3);
select lives_ok($$update public.profiles set display_name = 'Calvin' where id = pg_temp.u(3)$$,
  'a suspended player with no name can still pick one');
reset role;

-- The suspension runs out.
alter table public.moderation_actions disable trigger moderation_actions_frozen;
update public.moderation_actions set expires_at = now() - interval '1 minute' where action = 'suspend';
alter table public.moderation_actions enable trigger moderation_actions_frozen;
select is(pg_temp.standing(), 'active', 'a suspension ends on its own');
set local role authenticated;
select pg_temp.act(3);
select lives_ok($$select pg_temp.pick()$$, 'and they can pick again');
reset role;

-------------------------------------------------------------------------------
-- Ban and lift
-------------------------------------------------------------------------------

select results_eq(format('select standing, strikes from public.moderate(%s, %L, %L)', pg_temp.case_of(1), 'ban', 'Third strike'),
  $$values ('banned'::text, 2)$$, 'a ban, on the same case, adds no strike');
select isnt((select banned_until from auth.users where id = pg_temp.u(3)), null, 'sign-in is refused');
select is((pg_temp.notices())[4], null, 'a ban sends no notice');
select is_empty($$select 1 from public.season_leaderboard() where user_id = pg_temp.u(3)$$, 'they leave the leaderboard');
select is(public.league_display_name(pg_temp.u(3)), 'Former Member', 'and show as Former Member in leagues');
set local role authenticated;
select pg_temp.act(5);
select results_eq($$select display_name, status from public.league_standings('00000000-0000-0000-0000-0000000000aa') where user_id = pg_temp.u(3)$$,
  $$values ('Former Member'::text, 'former'::text)$$, 'listed as a former member in league standings');
reset role;
select is((select owner_id from public.leagues where name = 'Cal League'), pg_temp.u(5), 'their leagues pass to another member');
set local role authenticated;
select pg_temp.act(3);
select throws_ok($$select pg_temp.pick()$$, 'P0001', 'Your account has been banned.', 'a still-valid token can''t pick');
reset role;

select results_eq(format('select standing from public.moderate(%s, %L, %L)', pg_temp.case_of(1), 'lift', 'Appeal accepted'),
  $$values ('active'::text)$$, 'lift restores them');
select is((select banned_until from auth.users where id = pg_temp.u(3)), null, 'and they can sign in again');
select is((pg_temp.notices())[4], 'lift', 'and are told');

-------------------------------------------------------------------------------
-- The log
-------------------------------------------------------------------------------

select throws_ok($$update public.moderation_actions set reason = 'edited'$$, 'P0001', null, 'actions can''t be edited');
select results_eq($$select array_agg(action order by id) from public.moderation_actions$$,
  $$values (array['warn', 'reset_name', 'suspend', 'ban', 'lift'])$$, 'every decision is in the log, in order');

select * from finish();
rollback;
