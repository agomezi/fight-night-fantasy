-- Report guard: five reports a day from anywhere, repeats don't count against
-- that, reporters are judged established or new, a pile-on is marked burst,
-- and moderators are marked protected and can't make themselves so.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana reports; 02 to 08 are players to report; 09 Mod is a moderator.
insert into auth.users (id, email) select pg_temp.u(n), 'rg' || n || '@example.test' from generate_series(1, 9) n;
update public.profiles p set display_name = case n when 1 then 'Ana' when 9 then 'Mod' else 'Player' || n end
from generate_series(1, 9) n where p.id = pg_temp.u(n);
update public.profiles set is_moderator = true where id = pg_temp.u(9);

insert into public.leagues (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000aa', 'Gym League', pg_temp.u(1));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000aa'::uuid, pg_temp.u(n) from generate_series(1, 9) n;

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;

-------------------------------------------------------------------------------
-- The daily limit
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
-- Four from the leaderboard and one from the league.
select public.report_display_name(pg_temp.u(n), 'offensive name') from generate_series(2, 5) n;
select is(public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(6), 'other'), true,
  'a fifth report in a day goes through');
select throws_ok($$select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(7), 'other')$$,
  'P0001', 'You''ve sent a lot of reports today. Try again tomorrow.', 'a sixth from a league is refused');
select throws_ok($$select public.report_display_name(pg_temp.u(7), 'offensive name')$$,
  'P0001', null, 'and so is a sixth from the leaderboard');
select is(public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), 'other'), false,
  'repeating a report at the limit still just says it was already sent');
reset role;

select is((select count(*)::int from public.name_reports where reporter_id = pg_temp.u(1)), 5, 'five reports are recorded');

-- A day later there's room again.
update public.name_reports set created_at = now() - interval '25 hours' where reporter_id = pg_temp.u(1);
set local role authenticated;
select pg_temp.act(1);
select is(public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(7), 'other'), true,
  'the next day reports go through again');
reset role;

-------------------------------------------------------------------------------
-- Established reporters
-------------------------------------------------------------------------------

select is(public.reporter_established(pg_temp.u(1)), false, 'a new account is not established');
update public.profiles set created_at = now() - interval '8 days' where id = pg_temp.u(1);
select is(public.reporter_established(pg_temp.u(1)), false, 'nor is an old one with no scored picks');

select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'rg1', 'name', 'Card rg1', 'startsAt', now() - interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'rg11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', 'Lightweight',
    'red', jsonb_build_object('ufcFighterId', 'rg1r', 'name', 'Red', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'rg1b', 'name', 'Blue', 'nickname', null)))));
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(1), b.id, e.season_id, 0, 0, '{}'::jsonb, true, true
from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = 'rg11';
select is(public.reporter_established(pg_temp.u(1)), true, 'an account a week old with a scored pick is established');

-------------------------------------------------------------------------------
-- Pile-ons and protection
-------------------------------------------------------------------------------

-- Three new accounts report the moderator within the hour.
update public.name_reports set emailed_at = now() - interval '2 hours';
set local role authenticated;
select pg_temp.act(n), public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(9), 'offensive name')
from generate_series(2, 4) n;
reset role;

set local role service_role;
create temp table claimed as select * from public.claim_report_emails();
reset role;
select results_eq(
  $$select current_name, protected, reporters, established, burst, jsonb_array_length(reports) from claimed$$,
  $$values ('Mod'::text, true, 3, 0, true, 3)$$,
  'three new accounts reporting a moderator within the hour: one email, protected, marked burst'
);
select results_eq(
  $$select (r->>'reporterEstablished')::boolean, (r->>'reporterAgeDays')::int, (r->>'reporterReports')::int
    from claimed, jsonb_array_elements(reports) r order by r->>'reporterName' limit 1$$,
  $$values (false, 0, 1)$$,
  'each report carries its reporter''s standing, account age and reports filed'
);

-- Ana, established, reports Player8 alone: no burst.
set local role authenticated;
select pg_temp.act(1);
select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(8), 'impersonation');
reset role;
set local role service_role;
select results_eq($$select established, burst, protected from public.claim_report_emails()$$, $$values (1, false, false)$$,
  'one established reporter is no pile-on');
reset role;

-------------------------------------------------------------------------------
-- Players can't make themselves moderators
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select throws_ok($$update public.profiles set is_moderator = true where id = pg_temp.u(1)$$, '42501', null,
  'a player can''t make themselves a moderator');
select throws_ok($$select public.reporter_established(pg_temp.u(1))$$, '42501', null,
  'or call the reporter check');
reset role;

select * from finish();
rollback;
