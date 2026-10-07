-- League member profiles and reports: only players sharing a league see a
-- profile or can report, a profile carries only its few fields, and a report
-- is recorded once.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- A six-bout card, already fought: three lightweight bouts, two welterweight
-- and one with no weight class.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'mp1', 'name', 'Card mp1', 'startsAt', now() - interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'mp1' || o, 'order', o, 'segment', 'main',
      'scheduledRounds', 3,
      'weightClass', case when o <= 3 then 'Lightweight' when o <= 5 then 'Welterweight' end,
      'red', jsonb_build_object('ufcFighterId', 'mp1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'mp1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 6) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana and 02 Ben share a league; 03 Cal is outside it; 04 Dee is in it and
-- deletes her account.
insert into auth.users (id, email) select pg_temp.u(n), 'mp' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cal'), (4, 'Dee')) v(n, name)
where p.id = pg_temp.u(v.n);

insert into public.leagues (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000aa', 'Gym League', pg_temp.u(1)),
       ('00000000-0000-0000-0000-0000000000bb', 'Other League', pg_temp.u(3));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000aa'::uuid, pg_temp.u(n) from unnest(array[1, 2, 4]) n
union all
select '00000000-0000-0000-0000-0000000000bb'::uuid, pg_temp.u(3);

create function pg_temp.score(n int, bout_no int, hit boolean) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, e.season_id, 0, 0, '{}'::jsonb, hit, true
  from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = 'mp1' || bout_no
$$;
-- Ben: three lightweight (two right) and two welterweight (one right).
select pg_temp.score(2, 1, true), pg_temp.score(2, 2, true), pg_temp.score(2, 3, false),
       pg_temp.score(2, 4, true), pg_temp.score(2, 5, false);
-- Ana: too few scored picks for a favorite division.
select pg_temp.score(1, 1, true), pg_temp.score(1, 4, false);

update public.profiles set display_name = null, deleted_at = now() where id = pg_temp.u(4);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.gym() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;

set local role authenticated;

-------------------------------------------------------------------------------
-- Profile
-------------------------------------------------------------------------------

select pg_temp.act(1);
select results_eq(
  $$select display_name, accuracy, favorite_division, is_me, can_report, reported
      from public.league_member_profile(pg_temp.gym(), pg_temp.u(2))$$,
  $$values ('Ben'::text, 60, 'Lightweight'::text, false, true, false)$$,
  'a league mate sees the name, accuracy and most-picked division'
);
select results_eq(
  $$select accuracy, favorite_division, is_me, can_report from public.league_member_profile(pg_temp.gym(), pg_temp.u(1))$$,
  $$values (50, null::text, true, false)$$,
  'your own profile has no favorite division under five scored picks, and no report'
);
select results_eq(
  $$select display_name, accuracy, can_report from public.league_member_profile(pg_temp.gym(), pg_temp.u(4))$$,
  $$values ('Former Member'::text, null::integer, false)$$,
  'a deleted member shows as a former member and cannot be reported'
);
select is_empty(
  $$select * from public.league_member_profile(pg_temp.gym(), pg_temp.u(3))$$,
  'someone outside the league has no profile there'
);
select is_empty(
  $$select * from public.league_member_profile('00000000-0000-0000-0000-0000000000bb', pg_temp.u(3))$$,
  'nor can you see profiles in a league you are not in'
);

select pg_temp.act(3);
select is_empty(
  $$select * from public.league_member_profile(pg_temp.gym(), pg_temp.u(2))$$,
  'an outsider cannot see a league member''s profile'
);

-------------------------------------------------------------------------------
-- Reports
-------------------------------------------------------------------------------

select throws_ok(
  $$select public.report_league_member(pg_temp.gym(), pg_temp.u(2), 'offensive name')$$,
  'P0001', 'You can only report players in your leagues.', 'an outsider cannot report a league member'
);

select pg_temp.act(1);
select throws_ok(
  $$select public.report_league_member(pg_temp.gym(), pg_temp.u(1), 'offensive name')$$,
  'P0001', 'You can''t report yourself.', 'you cannot report yourself'
);
select throws_ok(
  $$select public.report_league_member(pg_temp.gym(), pg_temp.u(2), 'spam')$$,
  'P0001', 'Pick a reason for the report.', 'the reason must be one of the listed ones'
);
select throws_ok(
  $$select public.report_league_member(pg_temp.gym(), pg_temp.u(3), 'other')$$,
  'P0001', 'You can only report players in your leagues.', 'you cannot report someone outside the league'
);

select is(public.report_league_member(pg_temp.gym(), pg_temp.u(2), 'impersonation', '  pretends to be a pro  '), true,
  'a report is recorded');
select is(public.report_league_member(pg_temp.gym(), pg_temp.u(2), 'other', 'again'), false,
  'a second report of the same name adds nothing');
select is((select reported from public.league_member_profile(pg_temp.gym(), pg_temp.u(2))), true,
  'the profile shows it has been reported');

-- Ben renames; Ana still can't report him again, from the league or the leaderboard.
reset role;
update public.profiles set display_name = 'Ben_Two', name_changed_at = null where id = pg_temp.u(2);
set local role authenticated;
select pg_temp.act(1);
select is(public.report_league_member(pg_temp.gym(), pg_temp.u(2), 'offensive name'), false,
  'a renamed player cannot be reported again by the same player');
select public.report_display_name(pg_temp.u(2), 'offensive name');
select is((select reported from public.league_member_profile(pg_temp.gym(), pg_temp.u(2))), true,
  'the profile still shows them as reported after the rename');
select is(public.report_league_member(pg_temp.gym(), pg_temp.u(4), 'other'), false,
  'reporting a deleted account records nothing');

select throws_ok($$select * from public.name_reports$$, '42501', null, 'players cannot read reports');
select throws_ok(
  $$insert into public.name_reports (reporter_id, reported_id, display_name) values (pg_temp.u(1), pg_temp.u(2), 'Ben')$$,
  '42501', null, 'players cannot write reports directly'
);
select throws_ok($$select * from public.reported_names$$, '42501', null, 'players cannot read the review view');
select throws_ok($$select public.shares_league(pg_temp.gym(), pg_temp.u(2))$$, '42501', null,
  'the membership helper is not callable by players');

reset role;

select results_eq(
  $$select reporter_id, display_name, reason, league_id, note from public.name_reports where reported_id = pg_temp.u(2)$$,
  -- One row: neither the second league report nor the leaderboard one was kept.
  $$values (pg_temp.u(1), 'Ben'::text, 'impersonation'::text, pg_temp.gym(), 'pretends to be a pro'::text)$$,
  'the report keeps the name, reason, league and the trimmed note'
);
select results_eq(
  $$select reporters, reasons, notes, leagues from public.reported_names where player = pg_temp.u(2)$$,
  $$values (1::bigint, array['impersonation'], array['pretends to be a pro'], array['Gym League'])$$,
  'the review view shows the reasons, notes and leagues'
);

-------------------------------------------------------------------------------
-- A chosen favorite division
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(2);
update public.profiles set fav_division = 'Welterweight' where id = pg_temp.u(2);
select pg_temp.act(1);
select is((select favorite_division from public.league_member_profile(pg_temp.gym(), pg_temp.u(2))), 'Welterweight',
  'a division the player chose wins over the one they pick most');
select throws_ok($$update public.profiles set fav_division = 'Catchweight' where id = pg_temp.u(1)$$, '23514', null,
  'only a real division can be chosen');
-- Ana trying to set Ben's changes nothing.
update public.profiles set fav_division = 'Heavyweight' where id = pg_temp.u(2);
reset role;
select is((select fav_division from public.profiles where id = pg_temp.u(2)), 'Welterweight',
  'nobody can set another player''s division');
update public.profiles set display_name = null, deleted_at = now() where id = pg_temp.u(2);
select is((select fav_division from public.profiles where id = pg_temp.u(2)), null,
  'deleting the account clears it');

select * from finish();
rollback;
