-- League drops: the newest drop carries its publish time and the next card's
-- lock, and a league's members list its published drops, newest first.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.lg() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d1'::uuid $$;
create function pg_temp.other() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000d2'::uuid $$;
-- Far enough ahead that nothing else in the database is newer.
create function pg_temp.t(days int) returns timestamptz language sql as $$
  select '2040-01-01T00:00:00Z'::timestamptz + make_interval(days => days)
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'ld' || n || '@example.test' from generate_series(1, 3) n;
insert into public.leagues (id, name, owner_id, tier) values
  (pg_temp.lg(), 'Drop League', pg_temp.u(1), 'pro'),
  (pg_temp.other(), 'Other League', pg_temp.u(3), 'pro');
insert into public.league_members (league_id, user_id) values
  (pg_temp.lg(), pg_temp.u(1)), (pg_temp.lg(), pg_temp.u(2)), (pg_temp.other(), pg_temp.u(3));

-- Three published drops (the last with nothing for this league) and one not yet published.
insert into public.award_drops (id, label, kind, season_id, ran_at, published_at) values
  ('00000000-0000-0000-0000-00000000dd01', 'First check-in', 'checkin', public.current_season(), pg_temp.t(0), pg_temp.t(0)),
  ('00000000-0000-0000-0000-00000000dd02', 'Midseason', 'midseason', public.current_season(), pg_temp.t(10), pg_temp.t(11)),
  ('00000000-0000-0000-0000-00000000dd03', 'Other only', 'checkin', public.current_season(), pg_temp.t(5), pg_temp.t(5)),
  ('00000000-0000-0000-0000-00000000dd04', 'Unpublished', 'checkin', public.current_season(), pg_temp.t(12), null);
insert into public.drop_awards (drop_id, scope, award, user_id, value) values
  ('00000000-0000-0000-0000-00000000dd01', pg_temp.lg()::text, 'interim_champ', pg_temp.u(1), null),
  ('00000000-0000-0000-0000-00000000dd03', pg_temp.other()::text, 'interim_champ', pg_temp.u(3), null),
  ('00000000-0000-0000-0000-00000000dd04', pg_temp.lg()::text, 'interim_champ', pg_temp.u(2), null);
-- The midseason drop only has a table for the league, no awards.
insert into public.drop_stats (drop_id, scope, user_id, stats) values
  ('00000000-0000-0000-0000-00000000dd02', pg_temp.lg()::text, pg_temp.u(2), '{"rank": 1}');

-- Cards after the midseason drop: a cancelled one first, then two real ones.
insert into public.events (name, starts_at, locks_at, status) values
  ('Cancelled card', pg_temp.t(12), pg_temp.t(12), 'cancelled'),
  ('Next card', pg_temp.t(14), pg_temp.t(14), 'scheduled'),
  ('Card after', pg_temp.t(21), pg_temp.t(21), 'scheduled');

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.latest_award_drop_v2()', 'execute')
          and has_function_privilege('authenticated', 'public.league_award_drops(uuid)', 'execute'),
  'players can call both');
select ok(not has_function_privilege('anon', 'public.latest_award_drop_v2()', 'execute')
          and not has_function_privilege('anon', 'public.league_award_drops(uuid)', 'execute'),
  'signed-out callers can''t');

-------------------------------------------------------------------------------
-- The newest drop
-------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);

select is((select label from public.latest_award_drop_v2()), 'Midseason', 'v2 returns the newest published drop');
select is((select published_at from public.latest_award_drop_v2()), pg_temp.t(11), 'with when it was published');
select is((select next_lock_at from public.latest_award_drop_v2()), pg_temp.t(14),
  'and the first card to lock after that, skipping a cancelled one');
select is((select id from public.latest_award_drop()), (select id from public.latest_award_drop_v2()),
  'the old call still returns the same drop');

-------------------------------------------------------------------------------
-- A league's drops
-------------------------------------------------------------------------------

select is(array(select label from public.league_award_drops(pg_temp.lg())), array['Midseason', 'First check-in'],
  'a member lists the league''s published drops, newest first');
select ok(not exists (select 1 from public.league_award_drops(pg_temp.lg()) where label = 'Unpublished'),
  'an unpublished drop isn''t listed');
select ok(not exists (select 1 from public.league_award_drops(pg_temp.lg()) where label = 'Other only'),
  'nor one with nothing for this league');
select is((select published_at from public.league_award_drops(pg_temp.lg()) where label = 'First check-in'), pg_temp.t(0),
  'each with its publish time');
select is((select next_lock_at from public.league_award_drops(pg_temp.lg()) where label = 'Midseason'), pg_temp.t(14),
  'and the next card''s lock');

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(3), 'role', 'authenticated')::text, true);
select throws_ok($$select * from public.league_award_drops(pg_temp.lg())$$, 'P0001', null,
  'nobody outside the league can list them');

-- No card on the schedule after the newest drop: null, not an error.
reset role;
delete from public.events where name in ('Next card', 'Card after');
set local role authenticated;
select is((select next_lock_at from public.latest_award_drop_v2()), null::timestamptz,
  'with no card on the schedule, the next lock is empty');
reset role;

select * from finish();
rollback;
