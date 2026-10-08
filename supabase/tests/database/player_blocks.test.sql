-- Blocking: a blocked player shows as "Blocked player" to the blocker, and
-- only to them, in standings, matchups, the leaderboard, the profile card and
-- the inbox; their league joins aren't sent to the blocker; unblocking
-- restores everything; and nobody can see anyone else's blocks.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Ana owns a league with 02 Ben and 03 Cal. Ana blocks Ben.
insert into auth.users (id, email) select pg_temp.u(n), 'pb' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = v.name
from (values (1, 'Ana'), (2, 'Ben'), (3, 'Cal'), (4, 'Dee')) v(n, name)
where p.id = pg_temp.u(v.n);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create temp table lg (id uuid, code text);
grant all on lg to authenticated;

set local role authenticated;
select pg_temp.act(1);
insert into lg select public.create_league('Gym League'), null;
update lg set code = (select invite_code from public.leagues where id = lg.id);
select pg_temp.act(3);
select public.join_league((select code from lg));
reset role;

-- A scored pick each, so both appear on the leaderboard.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'pb1', 'name', 'Card pb1', 'startsAt', now() - interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'pb11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', 'Lightweight',
    'red', jsonb_build_object('ufcFighterId', 'pb1r', 'name', 'Red', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'pb1b', 'name', 'Blue', 'nickname', null)))));
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(n), b.id, e.season_id, 10 * n, 10 * n, '{}'::jsonb, true, true
from public.bouts b join public.events e on e.id = b.event_id, generate_series(1, 3) n
where b.ufc_fight_id = 'pb11';

-------------------------------------------------------------------------------
-- Blocking
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select throws_ok($$select public.block_player(pg_temp.u(1))$$, 'P0001', 'You can''t block yourself.', 'you can''t block yourself');
select lives_ok($$select public.block_player(pg_temp.u(2))$$, 'Ana blocks Ben');
select lives_ok($$select public.block_player(pg_temp.u(2))$$, 'blocking again changes nothing');
select results_eq($$select player, display_name from public.my_blocks()$$, $$values (pg_temp.u(2), 'Ben'::text)$$,
  'Ana''s blocked list shows Ben by name');
reset role;

-- Ben joins Ana's league after she blocked him.
set local role authenticated;
select pg_temp.act(2);
select public.join_league((select code from lg));
reset role;
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'league_join'
  and key like '%' || pg_temp.u(2) || '%'), 0, 'a blocked player joining isn''t sent to the blocker');
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'league_join'), 1,
  'others still are');

-------------------------------------------------------------------------------
-- What the blocker sees
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select results_eq($$select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2)$$,
  $$values ('Blocked player'::text)$$, 'standings show Blocked player to the blocker');
select results_eq($$select display_name from public.season_leaderboard() where user_id = pg_temp.u(2)$$,
  $$values ('Blocked player'::text)$$, 'and so does the leaderboard');
select results_eq($$select display_name, blocked, can_report from public.league_member_profile((select id from lg), pg_temp.u(2))$$,
  $$values ('Blocked player'::text, true, true)$$, 'and the profile card, which knows it''s blocked');
select results_eq($$select display_name, blocked from public.league_member_profile((select id from lg), pg_temp.u(3))$$,
  $$values ('Cal'::text, false)$$, 'other players are unchanged');
select ok(not exists (select 1 from public.league_matchups((select id from lg)) m
  where m.name_a = 'Ben' or m.name_b = 'Ben'), 'matchups never name Ben to Ana');

-------------------------------------------------------------------------------
-- What everyone else sees
-------------------------------------------------------------------------------

select pg_temp.act(3);
select results_eq($$select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2)$$,
  $$values ('Ben'::text)$$, 'other players still see Ben');
select pg_temp.act(2);
select results_eq($$select display_name, blocked from public.league_member_profile((select id from lg), pg_temp.u(1))$$,
  $$values ('Ana'::text, false)$$, 'and Ben sees Ana as before: he isn''t told');
select is_empty($$select * from public.my_blocks()$$, 'Ben''s own blocked list is empty');

-------------------------------------------------------------------------------
-- Nobody reads anyone else's blocks
-------------------------------------------------------------------------------

select throws_ok($$select * from public.player_blocks$$, '42501', null, 'the blocks table can''t be read directly');
select throws_ok($$insert into public.player_blocks values (pg_temp.u(2), pg_temp.u(1))$$, '42501', null,
  'or written');
select throws_ok($$select public.blocked_by_me(pg_temp.u(1))$$, '42501', null, 'or probed');
reset role;

-------------------------------------------------------------------------------
-- The inbox, and unblocking
-------------------------------------------------------------------------------

-- A join Ben made before the block.
insert into public.notifications_sent (user_id, kind, key, payload)
values (pg_temp.u(1), 'league_join', (select id from lg) || ':' || pg_temp.u(2) || ':1',
  jsonb_build_object('league', 'Gym League', 'leagueId', (select id from lg), 'member', 'Ben'));
set local role authenticated;
select pg_temp.act(1);
select results_eq($$select payload->>'member' from public.my_notifications() where key like '%' || pg_temp.u(2) || '%'$$,
  $$values ('Blocked player'::text)$$, 'an old join from a blocked player is shown as Blocked player');

select public.unblock_player(pg_temp.u(2));
select is_empty($$select * from public.my_blocks()$$, 'unblocking empties the list');
select results_eq($$select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2)$$,
  $$values ('Ben'::text)$$, 'and Ben''s name is back');
select results_eq($$select payload->>'member' from public.my_notifications() where key like '%' || pg_temp.u(2) || '%'$$,
  $$values ('Ben'::text)$$, 'in the inbox too');
reset role;

-- Ben leaves and rejoins a week later: Ana hears about it again.
update public.league_members set left_at = now() where user_id = pg_temp.u(2);
update public.notifications_sent set sent_at = now() - interval '8 days' where user_id = pg_temp.u(1);
set local role authenticated;
select pg_temp.act(2);
select public.join_league((select code from lg));
reset role;
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'league_join'
  and key like '%' || pg_temp.u(2) || '%' and sent_at > now() - interval '1 day'), 1, 'after unblocking, joins are sent again');

select * from finish();
rollback;
