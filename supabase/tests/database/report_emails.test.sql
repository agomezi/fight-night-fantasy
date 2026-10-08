-- Report emails: a new report waits to be emailed and asks for the sender,
-- the sender claims each one once with everything the email needs, reports
-- it couldn't send go back in the queue, and players can't reach any of it.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana and 02 Ben report 03 Cal, who used to be Calvin. All share a league.
insert into auth.users (id, email) select pg_temp.u(n), 're' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Calvin')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set display_name = 'Cal' where id = pg_temp.u(3);

insert into public.leagues (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000aa', 'Gym League', pg_temp.u(1));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000aa'::uuid, pg_temp.u(n) from generate_series(1, 3) n;

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.report(n int, reason text, note text) returns boolean language sql as $$
  select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(3), reason, note)
$$;

-------------------------------------------------------------------------------
-- Filing
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select pg_temp.report(1, 'impersonation', 'Pretending to be me');
reset role;

select is((select count(*)::int from public.name_reports where emailed_at is null), 1,
  'a new report waits to be emailed');
select ok(exists (select 1 from pg_trigger where tgname = 'name_reports_email' and tgrelid = 'public.name_reports'::regclass),
  'and filing it asks the sender to run');

-------------------------------------------------------------------------------
-- Claiming
-------------------------------------------------------------------------------

set local role service_role;
select results_eq(
  $$select reported_id, reported_name, current_name, past_names, reason, note, league, reporter_id, reporter_name, reporters
    from public.claim_report_emails()$$,
  $$values (pg_temp.u(3), 'Cal'::text, 'Cal'::text, array['Calvin'], 'impersonation'::text, 'Pretending to be me'::text,
            'Gym League'::text, pg_temp.u(1), 'Ana'::text, 1)$$,
  'the sender claims it with the names, reason, note, league and reporter'
);
select is_empty($$select * from public.claim_report_emails()$$, 'and it is claimed only once');
reset role;

-- Ben reports Cal too; the count covers both reporters.
set local role authenticated;
select pg_temp.act(2);
select pg_temp.report(2, 'offensive name', null);
reset role;

set local role service_role;
create temp table claimed as select * from public.claim_report_emails();
select results_eq($$select reporter_name, reporters, note from claimed$$, $$values ('Ben'::text, 2, null::text)$$,
  'a second reporter''s email counts both reporters');

-------------------------------------------------------------------------------
-- Failing to send
-------------------------------------------------------------------------------

select public.release_report_emails(array(select report_id from claimed));
select results_eq($$select reporter_name from public.claim_report_emails()$$, $$values ('Ben'::text)$$,
  'a report the sender couldn''t email is claimed again next time');
reset role;

-- A report of the same player again adds nothing to send.
set local role authenticated;
select pg_temp.act(2);
select is(pg_temp.report(2, 'other', null), false, 'reporting the same player again records nothing');
reset role;
select is((select count(*)::int from public.name_reports where emailed_at is null), 0, 'so nothing waits to be emailed');

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select throws_ok($$select * from public.claim_report_emails()$$, '42501', null, 'players can''t claim report emails');
select throws_ok($$select public.release_report_emails(array[1::bigint])$$, '42501', null, 'or release them');
reset role;

-- The five-minute backstop runs when a report is waiting, even with no
-- notification pending.
update public.name_reports set emailed_at = null where reporter_id = pg_temp.u(1);
select lives_ok($$select public.invoke_pending_activity()$$, 'the backstop runs with a report waiting');

select * from finish();
rollback;
