-- The moderation screen: only moderators read the queue, a case or the
-- history; a case carries its player, reports and past actions; acting takes
-- it off the queue; and moderators are alerted once when a case opens and
-- once when it reaches three reporters, never about themselves.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana, 02 Ben and 03 Cyrus report 04 Cal. 05 Moe and 06 Mia are moderators.
insert into auth.users (id, email) select pg_temp.u(n), 'ms' || n || '@example.test' from generate_series(1, 6) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cyrus'), (4, 'Calvin'), (5, 'Moe'), (6, 'Mia')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set display_name = 'Cal' where id = pg_temp.u(4);
update public.profiles set is_moderator = true where id in (pg_temp.u(5), pg_temp.u(6));

insert into public.leagues (id, name, owner_id) values ('00000000-0000-0000-0000-0000000000aa', 'Gym League', pg_temp.u(1));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000aa'::uuid, pg_temp.u(n) from generate_series(1, 6) n;

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.report(by int, member int, reason text, note text default null) returns boolean language sql as $$
  select public.report_league_member('00000000-0000-0000-0000-0000000000aa', pg_temp.u(member), reason, note)
$$;
create function pg_temp.alerts(n int) returns text[] language sql as $$
  select coalesce(array_agg(payload->>'stage' order by sent_at, key), '{}') from public.notifications_sent
  where user_id = pg_temp.u(n) and kind = 'moderation_case'
$$;
create temp table cal_case (id bigint);
grant all on cal_case to authenticated;

-------------------------------------------------------------------------------
-- Alerts
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select pg_temp.report(1, 4, 'impersonation', 'Pretending to be me');
reset role;
insert into cal_case select case_id from public.name_reports where reported_id = pg_temp.u(4);

select results_eq(
  $$select user_id, payload from public.notifications_sent where kind = 'moderation_case' order by user_id$$,
  $$select pg_temp.u(n), jsonb_build_object('caseId', (select id from cal_case), 'stage', 'opened', 'name', 'Cal',
      'reason', 'impersonation', 'reporters', 1)
    from unnest(array[5, 6]) n$$,
  'every moderator is alerted when a case opens'
);

set local role authenticated;
select pg_temp.act(2);
select pg_temp.report(2, 4, 'offensive name');
reset role;
select is(pg_temp.alerts(5), array['opened'], 'a second reporter alerts no one');

set local role authenticated;
select pg_temp.act(3);
select pg_temp.report(3, 4, 'offensive name');
reset role;
select is(pg_temp.alerts(5), array['opened', 'three'], 'a third reporter alerts again');

-- A report on a moderator alerts the other moderators only.
set local role authenticated;
select pg_temp.act(1);
select pg_temp.report(1, 6, 'other');
reset role;
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(6) and kind = 'moderation_case'
  and payload->>'name' = 'Mia'), 0, 'a moderator is never alerted about a case on themselves');
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(5) and kind = 'moderation_case'
  and payload->>'name' = 'Mia'), 1, 'the other moderator is');

set local role service_role;
select results_eq(
  $$select distinct kind, wanted from public.claim_activity_notifications() where kind = 'moderation_case'$$,
  $$values ('moderation_case'::text, true)$$, 'case alerts are pushed whatever the moderator''s settings');
reset role;

-------------------------------------------------------------------------------
-- Who can read
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select is(public.am_moderator(), false, 'a player is not a moderator');
select throws_ok($$select * from public.moderation_queue()$$, '42501', 'Only moderators can do that.', 'and can''t read the queue');
select throws_ok($$select public.moderation_case((select id from cal_case))$$, '42501', null, 'or a case');
select throws_ok($$select * from public.moderation_history()$$, '42501', null, 'or the history');
select pg_temp.act(5);
select is(public.am_moderator(), true, 'a moderator is');

-------------------------------------------------------------------------------
-- The queue and a case
-------------------------------------------------------------------------------

select results_eq(
  $$select name, reporters, reasons, strikes, standing, protected from public.moderation_queue()$$,
  $$values ('Cal'::text, 3, array['impersonation', 'offensive name'], 0, 'active'::text, false),
           ('Mia'::text, 1, array['other'], 0, 'active'::text, true)$$,
  'the queue lists open cases, most reporters first'
);

create temp table doc as select public.moderation_case((select id from cal_case)) as d;
select is((select d->'player'->>'name' from doc), 'Cal', 'a case names the player');
select is((select d->'player'->'pastNames' from doc), '["Calvin"]'::jsonb, 'with their past names');
select is((select jsonb_array_length(d->'reports') from doc), 3, 'and every report');
select results_eq(
  $$select d->'reports'->2->>'reporter', d->'reports'->2->>'note', d->'reports'->2->>'league' from doc$$,
  $$values ('Ana'::text, 'Pretending to be me'::text, 'Gym League'::text)$$,
  'each with its reporter, note and league, newest first'
);

-------------------------------------------------------------------------------
-- Acting from the screen
-------------------------------------------------------------------------------

select public.moderate((select id from cal_case), 'reset_name', 'Offensive name', 'from the phone');
select is_empty($$select 1 from public.moderation_queue() where name = 'Cal' or name is null and reporters = 3$$,
  'an actioned case leaves the queue');
select results_eq(
  $$select action, player_name, reason, note, moderator from public.moderation_history()$$,
  $$values ('reset_name'::text, null::text, 'Offensive name'::text, 'from the phone'::text, 'Moe'::text)$$,
  'the history shows it, with who did it'
);
select is((select public.moderation_case((select id from cal_case))->'actions'->0->>'action'), 'reset_name',
  'and the case shows the player''s past actions');
reset role;

select * from finish();
rollback;
