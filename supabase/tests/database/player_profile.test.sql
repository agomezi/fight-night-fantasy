-- The player card from the global leaderboard: anyone signed in sees anyone's
-- card and can report them once, with a reason; the league versions still
-- need a shared league.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 and 02 share no league; 03 deletes their account.
insert into auth.users (id, email) select pg_temp.u(n), 'pp' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cal')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set display_name = null, deleted_at = now() where id = pg_temp.u(3);
insert into public.leagues (id, name, owner_id) values ('00000000-0000-0000-0000-0000000000aa', 'Gym', pg_temp.u(2));
insert into public.league_members (league_id, user_id) values ('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2));

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.act(1);

select is((select (display_name, is_me, can_report, reported)::text from public.player_profile(pg_temp.u(2))),
  '(Ben,f,t,f)', 'anyone''s card shows without a shared league');
select is((select (is_me, can_report)::text from public.player_profile(pg_temp.u(1))),
  '(t,f)', 'your own card has nothing to report');
select is((select can_report from public.player_profile(pg_temp.u(3))), false, 'a deleted account can''t be reported');
select is((select count(*)::int from public.league_member_profile('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2))),
  0, 'the league card still needs a shared league');

select throws_ok($$select public.report_player(pg_temp.u(2), 'rude', null)$$, 'P0001', 'Pick a reason for the report.',
  'a report needs one of the reasons');
select is(public.report_player(pg_temp.u(2), 'impersonation', '  pretending to be a pro  '), true, 'a report is filed');
reset role;
select is((select (reason, league_id, note)::text from public.name_reports where reported_id = pg_temp.u(2)),
  '(impersonation,,"pretending to be a pro")', 'with its reason and note, from no league');
set local role authenticated;
select pg_temp.act(1);
select is(public.report_player(pg_temp.u(2), 'other', null), false, 'and only once');
select is((select reported from public.player_profile(pg_temp.u(2))), true, 'which the card then shows');
select throws_ok($$select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), 'other', null)$$,
  'P0001', 'You can only report players in your leagues.', 'the league report still needs a shared league');

reset role;
set local role anon;
select throws_ok($$select * from public.player_profile(pg_temp.u(2))$$, '42501', null, 'signed-out callers can''t look');

select * from finish();
rollback;
