-- Profile badges and the locker: who earns which badge, what others see when
-- you hide something, and who sees nothing at all.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.locker(n int) returns jsonb language sql as $$
  select public.player_locker_v2(pg_temp.u(n))
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'pb' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = 'Badged' || v.n from generate_series(1, 4) v(n) where p.id = pg_temp.u(v.n);

-- A league player 1 owns from before Season 901, which plays that season.
insert into public.leagues (id, name, owner_id, created_at)
values ('00000000-0000-0000-0000-0000000000aa', 'Crew', pg_temp.u(1), now() - interval '90 days');
insert into public.seasons (id, number, starts_at) values ('00000000-0000-0000-0000-0000000000f1', 901, now() - interval '60 days');

-- Three cards in Season 901: two settled (player 1 played both, player 2
-- one) and one voided, which has no results.
insert into public.events (id, name, starts_at, locks_at, season_id, season_index)
select ('00000000-0000-0000-0000-0000000000e' || n)::uuid, 'Card ' || n, now() - (40 - n) * interval '1 day',
       now() - (40 - n) * interval '1 day', '00000000-0000-0000-0000-0000000000f1', n
from generate_series(1, 3) n;
insert into public.card_results (event_id, user_id, points, main_event_points, field, result) values
  ('00000000-0000-0000-0000-0000000000e1', pg_temp.u(1), 10, 3, 3, 'W'),
  ('00000000-0000-0000-0000-0000000000e2', pg_temp.u(1), 10, 3, 3, 'W'),
  ('00000000-0000-0000-0000-0000000000e1', pg_temp.u(2), 5, 1, 3, 'L');
insert into public.league_results (league_id, season_id, week, event_id, user_a, user_b, points_a, points_b, winner)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000f1', 1,
        '00000000-0000-0000-0000-0000000000e1', pg_temp.u(1), pg_temp.u(2), 10, 5, pg_temp.u(1));
-- Player 2's league only started after the season had.
insert into public.leagues (id, name, owner_id, created_at)
values ('00000000-0000-0000-0000-0000000000bb', 'Late', pg_temp.u(2), now() - interval '30 days');
insert into public.league_results (league_id, season_id, week, event_id, user_a, user_b, points_a, points_b, winner)
values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000f1', 1,
        '00000000-0000-0000-0000-0000000000e1', pg_temp.u(2), pg_temp.u(1), 5, 10, pg_temp.u(1));

set local role authenticated;
select pg_temp.act(2);
select is(pg_temp.locker(1)->'badges', '[]'::jsonb, 'nothing for a season still being played');

reset role;
-- Season 902 starts, so 901 is over. Player 3 reaches Legend (156 points)
-- and was a pre-season tester.
insert into public.seasons (id, number, starts_at) values ('00000000-0000-0000-0000-0000000000f2', 902, now() - interval '10 days');
-- Season 905, the newest, started long ago and has ended (its end, not a later season, finishes it): player 2 played its one card.
insert into public.seasons (id, number, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000f5', 905, now() - interval '300 days', now() - interval '250 days');
insert into public.events (id, name, starts_at, locks_at, season_id, season_index)
values ('00000000-0000-0000-0000-0000000000e5', 'Old card', now() - interval '280 days', now() - interval '280 days',
        '00000000-0000-0000-0000-0000000000f5', 1);
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
values ('00000000-0000-0000-0000-0000000000e5', pg_temp.u(2), 5, 1, 3, 'L');

insert into public.events (id, name, starts_at, locks_at, season_id)
select gen_random_uuid(), 'Legend card ' || n, now() - interval '5 days', now() - interval '5 days', null
from generate_series(1, 78) n;
insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
select e.id, pg_temp.u(3), 10, 3, 3, 'W' from public.events e where e.name like 'Legend card %';
update public.profiles set preseason_tester = true where id = pg_temp.u(3);
-- Player 1 hands Crew over to player 4 after running it.
update public.leagues set owner_id = pg_temp.u(4) where id = '00000000-0000-0000-0000-0000000000aa';

set local role authenticated;
select pg_temp.act(2);
select is(pg_temp.locker(1),
  '{"belt": {"rank": "Prospect", "stripes": 4}, "hidden": [],
    "badges": [{"id": "season_veteran", "seasons": [901]}, {"id": "commissioner", "seasons": [901]}]}'::jsonb,
  'every settled card played makes a veteran (voided and pre-season cards aside), and running the league a commissioner');
select is(pg_temp.locker(2)->'badges', '[{"id": "season_veteran", "seasons": [905]}]'::jsonb,
  'a season that has ended counts; one with a missed card, or a league started late, doesn''t');
select is(pg_temp.locker(3), '{"belt": {"rank": "Legend", "stripes": 0}, "hidden": [], "badges": [{"id": "og"}, {"id": "legend"}]}'::jsonb,
  'the top rank is a Legend, and a pre-season tester is OG');
select is(pg_temp.locker(4), '{"belt": {"rank": "Prospect", "stripes": 0}, "hidden": [], "badges": []}'::jsonb,
  'a new player has a plain belt, and taking over a league later isn''t running it');

select pg_temp.act(3);
select lives_ok($$select public.set_locker_item('og', false)$$, 'you can hide a badge');
select lives_ok($$select public.set_locker_item('belt', false)$$, 'or your belt');
select is(pg_temp.locker(3), '{"belt": {"rank": "Legend", "stripes": 0}, "hidden": ["og", "belt"], "badges": [{"id": "og"}, {"id": "legend"}]}'::jsonb,
  'you still see everything, with what you''ve hidden');
select pg_temp.act(2);
select is(pg_temp.locker(3), '{"belt": null, "hidden": [], "badges": [{"id": "legend"}]}'::jsonb,
  'others see only what you show');
select pg_temp.act(3);
select public.set_locker_item('og', true);
select public.set_locker_item('og', true);
select is(pg_temp.locker(3)->'hidden', '["belt"]'::jsonb, 'showing it again (twice) puts it back once');
select throws_ok($$select public.set_locker_item('crown', false)$$, '22023', null, 'only locker items can be hidden');
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.set_locker_item('og', false)$$, '28000', null, 'and only when signed in');
select pg_temp.act(3);
select throws_ok($$update public.profiles set preseason_tester = true where id = pg_temp.u(3)$$, '42501', null,
  'nobody can mark themselves OG');
select throws_ok($$update public.profiles set locker_hidden = '{}' where id = pg_temp.u(3)$$, '42501', null,
  'the locker is only changed through set_locker_item');

reset role;
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(2), pg_temp.u(1));
set local role authenticated;
select pg_temp.act(2);
select is(pg_temp.locker(1), null, 'nothing for a player you''ve blocked');

reset role;
set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action) values (0, pg_temp.u(3), 'ban');
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.act(4);
select is(pg_temp.locker(3), null, 'nothing for a banned player');

reset role;
update public.profiles set display_name = null, deleted_at = now() where id = pg_temp.u(4);
set local role authenticated;
select pg_temp.act(2);
select is(pg_temp.locker(4), null, 'nothing for a deleted account');

reset role;
set local role anon;
select throws_ok($$select public.player_locker_v2('00000000-0000-0000-0000-000000000001')$$, '42501', null,
  'signed-out callers can''t read lockers');

select * from finish();
rollback;
