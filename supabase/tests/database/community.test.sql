-- Community cards: generated takes are made once, the split stays hidden until
-- you vote or the take closes, takes resolve from final results (a draw
-- answers some), the card follows fight week, and only the app's three calls
-- are open to players.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Three fights, three days out.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'cm1', 'name', 'UFC Fight Night: Take vs. Split', 'startsAt', now() + interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'cm1' || o, 'order', o, 'segment', 'main',
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'cm1r' || o, 'name', 'Red Fighter ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'cm1b' || o, 'name', 'Blue Fighter ' || o, 'nickname', null)))
    from generate_series(1, 3) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'cm1' $$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'cm1' || o $$;
create function pg_temp.poll(s text) returns uuid language sql security definer as $$
  select id from public.community_polls where event_id = pg_temp.ev() and slug like s
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'cm' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = 'Taker' || v.n from generate_series(1, 4) v(n) where p.id = pg_temp.u(v.n);

-- Generation ------------------------------------------------------------------

select public.ensure_community();
select is((select array_agg(slug order by slug) from public.community_polls where event_id = pg_temp.ev())::text,
  (select array['distance:' || pg_temp.bid(1) || ':1', 'main_event:' || pg_temp.bid(1) || ':1', 'round1'])::text,
  'the main-event take, the distance and round 1 are made; no underdog take without odds');
select is((select question from public.community_polls where id = pg_temp.poll('main_event:%')),
  'Does Red Fighter 1 finish Blue Fighter 1 inside 2 rounds?', 'the main-event take names the fight');

update public.bouts set red_odds = -250, blue_odds = 400, underdog_corner = 'blue' where id = pg_temp.bid(2);
update public.bouts set red_odds = 150, blue_odds = -170, underdog_corner = 'red' where id = pg_temp.bid(3);
select public.ensure_community();
select is((select question from public.community_polls where id = pg_temp.poll('dog')),
  'Does Blue Fighter 2 pull off the upset against Red Fighter 2?', 'once odds are in, the longest underdog gets a take');
update public.bouts set red_odds = 600, blue_odds = -900, underdog_corner = 'red' where id = pg_temp.bid(3);
select public.ensure_community();
select is((select count(*)::int from public.community_polls where event_id = pg_temp.ev()), 4,
  'running again makes nothing new, even when the longest underdog moves');

-- Voting ----------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select is((public.vote_poll(pg_temp.poll('main_event:%'), 'yes'))->>'my_vote', 'yes', 'a player can vote');
select isnt((public.vote_poll(pg_temp.poll('main_event:%'), 'yes'))->'split', 'null'::jsonb, 'and sees the split after voting');
select throws_ok($$select public.vote_poll(pg_temp.poll('main_event:%'), 'maybe')$$, 'P0001', 'Not an option.', 'only an option counts');
select pg_temp.act(2);
select is((public.community_card())->>'type', 'poll', 'in fight week the card is a take');
reset role;
select is((public.poll_payload(pg_temp.poll('main_event:%'), pg_temp.u(2), now()))->'split', 'null'::jsonb,
  'someone who hasn''t voted doesn''t see the split');
select is((public.poll_payload(pg_temp.poll('main_event:%'), pg_temp.u(2), now()))->>'votes', '1',
  'but sees how many have voted');
set local role authenticated;
select pg_temp.act(2);
select public.vote_poll(pg_temp.poll('main_event:%'), 'no');
select is((public.vote_poll(pg_temp.poll('main_event:%'), 'yes'))->'split', '{"no": 0, "yes": 2}'::jsonb,
  'a vote can be changed before lock');
select pg_temp.act(3);
select public.vote_poll(pg_temp.poll('main_event:%'), 'no');
select public.vote_poll(pg_temp.poll('distance:%'), 'yes');
reset role;

-- Picks on the main event, so the crowd's lean shows once it locks.
set local session_replication_role = replica;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, case when n = 4 then b.blue_fighter_id else b.red_fighter_id end, 'ANY'
from public.bouts b, generate_series(1, 4) n where b.id = pg_temp.bid(1);
set local session_replication_role = origin;

select is((public.poll_payload(pg_temp.poll('main_event:%'), pg_temp.u(4), now()))->'consensus', 'null'::jsonb,
  'nobody sees how the fight was picked before it locks');

-- An owner take called off can't be voted on.
reset role;
create temp table owner_take as select public.add_hot_take(pg_temp.ev(), 'Does anyone miss weight?') as id;
grant select on owner_take to authenticated;
select public.resolve_hot_take((select id from owner_take), 'void');
set local role authenticated;
select pg_temp.act(4);
select throws_ok($$select public.vote_poll((select id from owner_take), 'yes')$$, 'P0001', 'This take has closed.',
  'a take that''s been called off can''t be voted on');
reset role;

-- Fight night ------------------------------------------------------------------

update public.events set locks_at = now() - interval '1 hour', starts_at = now() - interval '1 hour', status = 'live'
where id = pg_temp.ev();
update public.bouts set locks_at = now() - interval '1 minute' where event_id = pg_temp.ev();

set local role authenticated;
select pg_temp.act(4);
select throws_ok($$select public.vote_poll(pg_temp.poll('main_event:%'), 'yes')$$, 'P0001', 'This take has closed.',
  'a take can''t be voted on once its fight locks');
select is((public.community_card())->>'phase', 'live', 'on fight night the card is the main-event take');
select is((public.community_card())->'poll'->'split', '{"no": 1, "yes": 2}'::jsonb, 'with the split for everyone once closed');
select is((public.community_card())->'poll'->'consensus',
  '{"pct": 75, "picks": 4, "fighter": "Red Fighter 1"}'::jsonb, 'and how the crowd picked the fight');
reset role;

-- Resolving --------------------------------------------------------------------

insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select id, 'provisional', red_fighter_id, 'KO', 1, 'ufc_live' from public.bouts where id = pg_temp.bid(1);
select is(public.poll_outcome(pg_temp.poll('main_event:%')), null, 'a provisional result settles nothing');
update public.results set status = 'final' where bout_id = pg_temp.bid(1);
select is(public.poll_outcome(pg_temp.poll('main_event:%')), 'yes', 'a first-round KO by red is a finish inside 2');
select is(public.poll_outcome(pg_temp.poll('distance:%')), 'no', 'and didn''t go the distance');
select is(public.poll_outcome(pg_temp.poll('round1')), 'yes', 'and ended in round 1');
select is(public.poll_outcome(pg_temp.poll('dog')), null, 'the underdog''s fight is still to come');

update public.results set winner_fighter_id = null, method = null, round = null, void_reason = 'DRAW' where bout_id = pg_temp.bid(1);
select is(public.poll_outcome(pg_temp.poll('main_event:%')), 'no', 'a draw is no finish');
select is(public.poll_outcome(pg_temp.poll('distance:%')), 'yes', 'and goes the distance');
update public.results set void_reason = 'NC' where bout_id = pg_temp.bid(1);
select is(public.poll_outcome(pg_temp.poll('main_event:%')), 'void', 'a no contest calls it off');
update public.results set winner_fighter_id = (select blue_fighter_id from public.bouts where id = pg_temp.bid(1)),
  method = 'DEC', void_reason = null where bout_id = pg_temp.bid(1);
select is(public.poll_outcome(pg_temp.poll('main_event:%')), 'no', 'a decision for blue is a no');

set local role authenticated;
select pg_temp.act(3);
select is((select (wins, losses)::text from public.takes_record()), '(2,0)', 'your takes record counts settled takes you voted on');
reset role;

-- Card final ---------------------------------------------------------------------

insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select id, 'final', blue_fighter_id, 'SUB', 2, 'ufc_live' from public.bouts where id in (pg_temp.bid(2), pg_temp.bid(3));
update public.events set status = 'complete' where id = pg_temp.ev();
set local session_replication_role = replica;
-- 02 called the big underdog by submission in round 2.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method)
select pg_temp.u(2), b.id, b.version, b.blue_fighter_id, 'round', 2, 'SUB' from public.bouts b where b.id = pg_temp.bid(2);
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY' from public.bouts b, generate_series(3, 4) n where b.id = pg_temp.bid(2);
set local session_replication_role = origin;
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select k.user_id, k.bout_id, null, case when k.user_id = pg_temp.u(2) then 300 else 10 * n end, 0, '{}',
       k.picked_fighter_id = r.winner_fighter_id, true
from public.picks k join public.results r on r.bout_id = k.bout_id
join generate_series(1, 4) n on pg_temp.u(n) = k.user_id;
select public.ensure_community();
select is((select count(*)::int from public.community_finals where event_id = pg_temp.ev()), 1, 'the cron notes when a card goes final');

set local role authenticated;
select pg_temp.act(1);
select is((public.community_card())->>'type', 'top_performers', 'just after, the card is the top performers');
select is((public.community_card())->'players'->0->>'name', 'Taker2', 'led by the top scorer');
select is((public.community_card())->'ball_knowledge'->>'fighter', 'Blue Fighter 2', 'with the boldest call that landed');
select is((public.community_card())->'recap'->>'outcome', 'no', 'and how the main-event take went');
reset role;
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(1), pg_temp.u(2));
set local role authenticated;
select pg_temp.act(1);
select is((public.community_card())->'players'->0->>'name', 'Blocked player', 'a blocked player''s name is hidden');
reset role;
set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action, expires_at) values (0, pg_temp.u(2), 'suspend', now() + interval '7 days');
set local session_replication_role = origin;
select is((public.top_performers(pg_temp.ev(), pg_temp.u(3)))->'players'->0->>'name', 'Taker4', 'a suspended player is left off');
delete from public.moderation_actions where player = pg_temp.u(2);
set local role authenticated;
select pg_temp.act(1);

-- Two days on, with no league and no card coming, the top performers stay up.
reset role;
select is((public.community_card_at(null, pg_temp.u(1), now() + interval '3 days'))->>'type', 'top_performers',
  'between cards with no league, the last card''s best');
set local role authenticated;

-- League cards ---------------------------------------------------------------------

reset role;
insert into public.leagues (id, name, owner_id) values ('00000000-0000-0000-0000-0000000000aa', 'Crew', pg_temp.u(1));
insert into public.league_members (league_id, user_id, status, joined_at)
select '00000000-0000-0000-0000-0000000000aa', pg_temp.u(n), 'active', now() - interval '30 days' from generate_series(1, 4) n;
select is((public.league_card('00000000-0000-0000-0000-0000000000aa', pg_temp.u(1), pg_temp.ev(), 'top_predictor'))->'pick'->>'name',
  'Blocked player', 'the league''s top scorer, name hidden from a player who blocked them');
select is((public.league_card('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), pg_temp.ev(), 'losers'))->'pick'->>'name',
  'Taker1', 'the league''s bottom scorer');
select is(((public.league_card('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), pg_temp.ev(), 'craftiest'))->'pick')
          - array['name', 'is_me', 'finish_round', 'method', 'points'],
  '{"finish": "ANY", "fighter": "Blue Fighter 1", "on_fight": 4, "with_them": 1}'::jsonb, 'the correct pick the fewest made');
select is(public.league_card('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), pg_temp.ev(), 'jobber'), null,
  'no Jobber in a league under 5');
insert into auth.users (id, email) values (pg_temp.u(5), 'cm5@example.test');
update public.profiles set display_name = 'Taker5' where id = pg_temp.u(5);
insert into public.league_members (league_id, user_id, status, joined_at)
values ('00000000-0000-0000-0000-0000000000aa', pg_temp.u(5), 'active', now() - interval '30 days');
set local session_replication_role = replica;
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(5), b.id, b.version, b.red_fighter_id, 'ANY' from public.bouts b where b.id = pg_temp.bid(1);
set local session_replication_role = origin;
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
values (pg_temp.u(5), pg_temp.bid(1), null, 25, 0, '{}', false, true);
-- Points: 02 600, 04 80, 03 60, 05 25, 01 10, so 03 is in the middle.
select is((public.league_card('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), pg_temp.ev(), 'jobber'))->'pick'->>'name',
  'Taker3', 'the Jobber is the player dead in the middle');
select is((public.community_card_at('00000000-0000-0000-0000-0000000000aa', pg_temp.u(2), now() + interval '3 days'))->>'type',
  'league', 'between cards, a member gets a league card');
select is((public.community_card_at('00000000-0000-0000-0000-0000000000aa', pg_temp.u(9), now() + interval '3 days'))->>'type',
  'top_performers', 'someone not in the league doesn''t');
set local role authenticated;
select pg_temp.act(1);

-- Access ---------------------------------------------------------------------------

select throws_ok($$select * from public.community_polls$$, '42501', null, 'players can''t read takes directly');
reset role;
set local role anon;
select throws_ok($$select public.community_card()$$, '42501', null, 'signed-out callers get nothing');

select * from finish();
rollback;
