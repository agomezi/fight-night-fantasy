-- Leagues: creating and joining, who can see what, the season boundary, the
-- schedule, matchups, standings at the league's tier, and leaving.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
-- A three-bout card; order 1 is the main event, fought last.
create function pg_temp.card(ev text, starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', starts, 'status', 'scheduled',
    'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', ev || o, 'order', o, 'segment', 'main',
        'scheduledRounds', 3, 'weightClass', null, 'red', pg_temp.f(ev || 'r' || o), 'blue', pg_temp.f(ev || 'b' || o)))
      from generate_series(1, 3) o))
$$;
select public.sync_event_card(pg_temp.card('lg1', now() - interval '9 days'));
select public.sync_event_card(pg_temp.card('lg2', now() - interval '2 days'));
select public.sync_event_card(pg_temp.card('lg3', now() + interval '5 days'));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Alpha, 02 Bravo, 03 Charlie, 04 Delta, 05 Echo (unnamed), 06 Xray, 10-21 fillers.
insert into auth.users (id, email)
select pg_temp.u(n), 'p' || n || '@example.test' from unnest(array[1,2,3,4,5,6]) n
union all
select pg_temp.u(n), 'p' || n || '@example.test' from generate_series(10, 21) n;
update public.profiles p set display_name = v.name
from (values (1, 'Alpha'), (2, 'Bravo'), (3, 'Charlie'), (4, 'Delta'), (6, 'Xray')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set display_name = 'Filler' || substring(id::text from 35)
where id between pg_temp.u(10) and pg_temp.u(21);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.bid(fight text) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = fight
$$;
-- `casual` is what a Casual league plays; the full points are doubled so a
-- test that reads them by mistake fails.
create function pg_temp.score(n int, fight text, casual int, pro int default null) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, e.season_id, coalesce(pro, casual * 2), casual,
         case when coalesce(pro, casual) < 0
              then '{"fighter": -50, "method": -30, "round": -15, "underdogBonus": 0}'
              else '{"fighter": 50, "method": 0, "round": 0, "underdogBonus": 0}' end::jsonb,
         casual > 0, true
  from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = fight
$$;

set local role authenticated;

-------------------------------------------------------------------------------
-- Creating and joining
-------------------------------------------------------------------------------

select pg_temp.act(5);
select throws_ok($$select public.create_league('Nameless')$$, 'P0001', 'Pick a display name first.',
  'a player without a name cannot create a league');

select pg_temp.act(1);
select throws_ok($$select public.create_league('Judges', 'hardcore')$$, 'P0001', null, 'Hardcore is not open');
select throws_ok($$select public.create_league('   ')$$, 'P0001', 'League names are 1 to 40 characters.', 'a blank name is refused');
select throws_ok($$insert into public.leagues (name, owner_id) values ('Direct', '00000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'leagues cannot be inserted directly');

create temp table ids (name text primary key, id uuid, code text);
grant all on ids to authenticated;
create function pg_temp.id(which text) returns uuid language sql as $$ select id from ids where ids.name = which $$;
-- Codes are recorded while the owner can read them; members-to-be cannot.
create function pg_temp.code(which text) returns text language sql as $$ select code from ids where ids.name = which $$;
create function pg_temp.keep_codes() returns void language sql as $$
  update ids set code = l.invite_code from public.leagues l where l.id = ids.id and ids.code is null
$$;
create function pg_temp.join_as(n int, code text) returns uuid language plpgsql as $$
begin
  perform pg_temp.act(n);
  return public.join_league(code);
end;
$$;
insert into ids values ('L', public.create_league('  The   Alpha League ', 'casual'));
insert into ids values ('S', public.create_league('Small', 'amateur'));
select pg_temp.keep_codes();

select is((select name from public.leagues where id = pg_temp.id('L')), 'The Alpha League', 'the name is tidied');
select results_eq(
  $$select user_id, status::text from public.league_members where league_id = pg_temp.id('L')$$,
  $$values ('00000000-0000-0000-0000-000000000001'::uuid, 'queued')$$,
  'the owner is the first member, queued for the next season'
);

select pg_temp.act(2);
select throws_ok($$select public.join_league('nope0000')$$, 'P0001', 'No league has that code.', 'an unknown code is refused');
select is(public.join_league(upper(' ' || pg_temp.code('L') || ' ')), pg_temp.id('L'), 'codes are read case-insensitively');
select is(public.join_league(pg_temp.code('L')), pg_temp.id('L'), 'joining twice does nothing');
select public.join_league(pg_temp.code('S'));
select pg_temp.act(3);
select public.join_league(pg_temp.code('L'));
select public.join_league(pg_temp.code('S'));
select pg_temp.act(4);
select public.join_league(pg_temp.code('L'));

-- Members see each other; nobody else sees the league at all.
select pg_temp.act(4);
select is((select count(*)::int from public.league_members where league_id = pg_temp.id('L')), 4, 'members see every member');
select pg_temp.act(10);
select is((select count(*)::int from public.leagues where id = pg_temp.id('L')), 0, 'outsiders cannot see the league');
select throws_ok($$select * from public.league_standings(pg_temp.id('L'))$$, 'P0001', 'You''re not in that league.',
  'outsiders cannot read the standings');

-- A league fills at twelve.
select pg_temp.act(10);
insert into ids values ('F', public.create_league('Full House'));
select pg_temp.keep_codes();
select pg_temp.join_as(n, pg_temp.code('F')) from generate_series(11, 21) n;
select pg_temp.act(1);
select throws_ok($$select public.join_league(pg_temp.code('F'))$$, 'P0001', 'That league is full.', 'a thirteenth member is refused');

-------------------------------------------------------------------------------
-- Pre-season
-------------------------------------------------------------------------------

select pg_temp.act(1);
select is((select count(*)::int from public.league_matchups(pg_temp.id('L')) where week = 1 and state = 'upcoming'), 2,
  'a new league of four previews its first pre-season week');
select ok((select bool_and(rank is null and status = 'active') from public.league_standings(pg_temp.id('L'))),
  'nobody is ranked before a card is played');
select is((select distinct season_label from public.league_standings(pg_temp.id('L'))), 'PRE-SEASON', 'labelled pre-season');
select is((select count(*)::int from public.league_matchups(pg_temp.id('S'))), 0, 'a league of three has no matchups');

-- The leagues were made before both cards, which are now over.
reset role;
update public.leagues set created_at = created_at - interval '30 days';
update public.league_members set joined_at = joined_at - interval '30 days';
update public.events set status = 'complete' where ufc_event_id in ('lg1', 'lg2');

-- Scores. Positions by join order: Alpha 0, Bravo 1, Charlie 2, Delta 3.
-- Week 1 pairs Bravo-Charlie and Alpha-Delta; week 2 Alpha-Bravo and Charlie-Delta.
--   Week 1: Alpha 100 beats Delta 50; Bravo 80 draws Charlie 80.
--   Week 2: Bravo 60 beats Alpha 40; Delta 90 beats Charlie 10.
-- Charlie's week 1 is -50 then +130: the floor holds the season total at 0
-- after the first bout, so the card shows 80 but the season gets 130 (140 with week 2).
select pg_temp.score(1, 'lg11', 100);
select pg_temp.score(4, 'lg11', 50);
select pg_temp.score(2, 'lg11', 80);
select pg_temp.score(3, 'lg13', -50, -95);
select pg_temp.score(3, 'lg11', 130);
select pg_temp.score(1, 'lg21', 40);
select pg_temp.score(2, 'lg21', 60);
select pg_temp.score(3, 'lg21', 10);
select pg_temp.score(4, 'lg21', 90);
-- Delta's accuracy matches Alpha's: one more correct pick on a bout worth 0.
select pg_temp.score(1, 'lg22', 0);
update public.scores set correct = true where user_id = pg_temp.u(1) and bout_id = pg_temp.bid('lg22');

set local role authenticated;
select pg_temp.act(1);
select results_eq(
  $$select week, state, name_a, points_a, name_b, points_b, winner, is_mine
    from public.league_matchups(pg_temp.id('L'))$$,
  $$values
    (1, 'final', 'Alpha', 100, 'Delta', 50, '00000000-0000-0000-0000-000000000001'::uuid, true),
    (1, 'final', 'Bravo', 80, 'Charlie', 80, null::uuid, false),
    (2, 'final', 'Alpha', 40, 'Bravo', 60, '00000000-0000-0000-0000-000000000002'::uuid, true),
    (2, 'final', 'Charlie', 10, 'Delta', 90, '00000000-0000-0000-0000-000000000004'::uuid, false),
    (3, 'upcoming', 'Alpha', null, 'Charlie', null, null::uuid, true),
    (3, 'upcoming', 'Delta', null, 'Bravo', null, null::uuid, false)$$,
  'the pre-season plays every card since the league was made'
);
select results_eq(
  $$select rank, display_name, status, wins, losses, draws, points from public.league_standings(pg_temp.id('L'))$$,
  $$values (1::bigint, 'Bravo', 'active', 1, 0, 1, 140), (2::bigint, 'Alpha', 'active', 1, 1, 0, 140),
           (3::bigint, 'Delta', 'active', 1, 1, 0, 140), (4::bigint, 'Charlie', 'active', 0, 1, 1, 140)$$,
  'and has a table'
);

-- Leaving in the pre-season keeps the weeks you played.
select pg_temp.act(21);
select public.leave_league(pg_temp.id('F'));
select pg_temp.act(10);
select ok(not exists (select 1 from public.league_standings(pg_temp.id('F')) where user_id = pg_temp.u(21)),
  'someone who leaves in the pre-season leaves the table');
select is((select count(*)::int from public.league_matchups(pg_temp.id('F'))
           where week = 1 and pg_temp.u(21) in (user_a, user_b)), 1,
  'but their past matchups stay');
select is((select count(*)::int from public.league_matchups(pg_temp.id('F'))
           where week = 3 and pg_temp.u(21) in (user_a, user_b)), 0,
  'and they are out of the weeks to come');
select pg_temp.act(1);
select is(public.join_league(pg_temp.code('F')), pg_temp.id('F'), 'their place is free');

-------------------------------------------------------------------------------
-- The season opens
-------------------------------------------------------------------------------

reset role;
insert into public.seasons (number, starts_at) values (1, now() - interval '10 days');

-- Before any card is slotted, the season starts clean.
set local role authenticated;
select pg_temp.act(1);
select results_eq(
  $$select week, state from public.league_matchups(pg_temp.id('L'))$$,
  $$values (1, 'upcoming'), (1, 'upcoming')$$,
  'a new season starts at week 1'
);
select ok((select bool_and(rank is null and points = 0 and wins + losses + draws = 0)
           from public.league_standings(pg_temp.id('L'))), 'with a clean table');
reset role;

update public.events e set season_id = (select id from public.seasons where number = 1), season_index = v.idx
from (values ('lg1', 1), ('lg2', 2)) v(ev, idx) where e.ufc_event_id = v.ev;

select results_eq(
  $$select user_id, status::text from public.league_members where league_id = pg_temp.id('L') order by joined_at$$,
  $$values ('00000000-0000-0000-0000-000000000001'::uuid, 'active'), ('00000000-0000-0000-0000-000000000002'::uuid, 'active'),
           ('00000000-0000-0000-0000-000000000003'::uuid, 'active'), ('00000000-0000-0000-0000-000000000004'::uuid, 'active')$$,
  'a league of four is activated'
);
select ok((select bool_and(status = 'active' and active_from_season_id is not null)
           from public.league_members where league_id = pg_temp.id('L')), 'members record the season they start');
select ok((select bool_and(status = 'queued') from public.league_members where league_id = pg_temp.id('S')),
  'a league of three stays queued');

-- Joining once the season is under way queues for the next one.
set local role authenticated;
select is(pg_temp.join_as(6, pg_temp.code('S')), pg_temp.id('S'), 'joining mid-season is allowed');
reset role;
select is((select status::text from public.league_members where league_id = pg_temp.id('S') and user_id = pg_temp.u(6)),
  'queued', 'and waits for the next season');


set local role authenticated;
select pg_temp.act(1);

-------------------------------------------------------------------------------
-- Matchups
-------------------------------------------------------------------------------

select results_eq(
  $$select week, state, name_a, points_a, name_b, points_b, winner, is_mine
    from public.league_matchups(pg_temp.id('L'))$$,
  $$values
    (1, 'final', 'Alpha', 100, 'Delta', 50, '00000000-0000-0000-0000-000000000001'::uuid, true),
    (1, 'final', 'Bravo', 80, 'Charlie', 80, null::uuid, false),
    (2, 'final', 'Alpha', 40, 'Bravo', 60, '00000000-0000-0000-0000-000000000002'::uuid, true),
    (2, 'final', 'Charlie', 10, 'Delta', 90, '00000000-0000-0000-0000-000000000004'::uuid, false),
    (3, 'upcoming', 'Alpha', null, 'Charlie', null, null::uuid, true),
    (3, 'upcoming', 'Delta', null, 'Bravo', null, null::uuid, false)$$,
  'pairings rotate weekly, card points use the tier, equal points draw, and next week is previewed'
);
select is((select distinct event_name from public.league_matchups(pg_temp.id('L')) where week = 3), 'Card lg3',
  'the preview names the next card to lock');

reset role;
update public.scores set provisional = true where user_id = pg_temp.u(4) and bout_id = pg_temp.bid('lg21');
set local role authenticated;
select pg_temp.act(1);
select is((select array_agg(distinct state) from public.league_matchups(pg_temp.id('L')) where week = 2), array['live'],
  'a provisional score keeps the card live');
reset role;
update public.scores set provisional = false;
set local role authenticated;
select pg_temp.act(1);

-------------------------------------------------------------------------------
-- Standings
-------------------------------------------------------------------------------

-- Records: Bravo 1-0-1, Alpha 1-1-0, Delta 1-1-0, Charlie 0-1-1.
-- Alpha and Delta are level on record, points (140) and accuracy (2 of 2);
-- Alpha beat Delta in week 1.
select results_eq(
  $$select rank, display_name, status, wins, losses, draws, points, is_me, is_owner
    from public.league_standings(pg_temp.id('L'))$$,
  $$values
    (1::bigint, 'Bravo', 'active', 1, 0, 1, 140, false, false),
    (2::bigint, 'Alpha', 'active', 1, 1, 0, 140, true, true),
    (3::bigint, 'Delta', 'active', 1, 1, 0, 140, false, false),
    (4::bigint, 'Charlie', 'active', 0, 1, 1, 140, false, false)$$,
  'ranked on record, then points, then accuracy, then head-to-head; Casual floors the season'
);
select is((select distinct season_label from public.league_standings(pg_temp.id('L'))), 'SEASON 1', 'labelled with the season');

-- Amateur: the floor, and the debt paid out of the next points.
reset role;
select pg_temp.score(6, 'lg13', -95, -95);
select pg_temp.score(6, 'lg11', 50, 50);
select is((select points from public.league_season_totals(pg_temp.id('S'), (select id from public.seasons where number = 1))
           where user_id = pg_temp.u(6)), 30, 'Amateur floors at 0, owes 20, and pays it from the next points');
set local role authenticated;

-------------------------------------------------------------------------------
-- My leagues
-------------------------------------------------------------------------------

select pg_temp.act(2);
select results_eq(
  $$select name, tier::text, is_owner, members, my_status, wins, losses, draws from public.my_leagues()$$,
  $$values ('The Alpha League', 'casual', false, 4, 'active', 1, 0, 1), ('Small', 'amateur', false, 4, 'queued', 0, 0, 0)$$,
  'my leagues lists each with how it is going'
);

-- Level on record, points and accuracy with a drawn head-to-head: a shared
-- rank. Week 1 Alpha 100 draws Delta 100; week 2 Alpha 70 beats Bravo 60 and
-- Delta 70 beats Charlie 10. Bravo and Charlie are level on record and points
-- (140), and Bravo's accuracy (2 of 2) beats Charlie's (2 of 3).
reset role;
update public.scores set casual_points = 100 where user_id = pg_temp.u(4) and bout_id = pg_temp.bid('lg11');
update public.scores set casual_points = 70 where user_id in (pg_temp.u(1), pg_temp.u(4)) and bout_id = pg_temp.bid('lg21');
set local role authenticated;
select pg_temp.act(1);
select results_eq(
  $$select rank, display_name, wins, losses, draws, points from public.league_standings(pg_temp.id('L'))$$,
  $$values (1::bigint, 'Alpha', 1, 0, 1, 170), (1::bigint, 'Delta', 1, 0, 1, 170),
           (3::bigint, 'Bravo', 0, 1, 1, 140), (4::bigint, 'Charlie', 0, 1, 1, 140)$$,
  'players level on everything, head-to-head included, share a rank'
);

-- A draw is a third of a win. Week 1: Delta 60 beats Alpha 50, Bravo draws
-- Charlie. Week 2: Alpha draws Bravo 70-70, Charlie 90 beats Delta 10. Bravo
-- (0-0-2) has more points than Delta (1-1) but ranks below: at half a win
-- they would be level on record and Bravo's points would put them ahead.
reset role;
update public.scores set casual_points = 50 where user_id = pg_temp.u(1) and bout_id = pg_temp.bid('lg11');
update public.scores set casual_points = 60 where user_id = pg_temp.u(4) and bout_id = pg_temp.bid('lg11');
update public.scores set casual_points = 70 where user_id = pg_temp.u(2) and bout_id = pg_temp.bid('lg21');
update public.scores set casual_points = 90 where user_id = pg_temp.u(3) and bout_id = pg_temp.bid('lg21');
update public.scores set casual_points = 10 where user_id = pg_temp.u(4) and bout_id = pg_temp.bid('lg21');
set local role authenticated;
select pg_temp.act(1);
select results_eq(
  $$select rank, display_name, wins, losses, draws, points from public.league_standings(pg_temp.id('L'))$$,
  $$values (1::bigint, 'Charlie', 1, 0, 1, 220), (2::bigint, 'Delta', 1, 1, 0, 70),
           (3::bigint, 'Bravo', 0, 0, 2, 150), (4::bigint, 'Alpha', 0, 1, 1, 120)$$,
  'a win is worth 3, a draw 1'
);

-------------------------------------------------------------------------------
-- Leaving
-------------------------------------------------------------------------------

select pg_temp.act(4);
select public.leave_league(pg_temp.id('L'));
select is((select status from public.league_standings(pg_temp.id('L')) where display_name = 'Delta'), 'left',
  'an active member who leaves stays in the season, marked as left');
select is((select count(*)::int from public.league_matchups(pg_temp.id('L')) where week = 3), 2,
  'the schedule does not change mid-season');
select is((select count(*)::int from public.my_leagues()), 0, 'a league you left is gone from your list');
select throws_ok($$select public.leave_league(pg_temp.id('L'))$$, 'P0001', 'You''re not in that league.', 'you cannot leave twice');

select pg_temp.act(2);
select throws_ok($$select public.remove_league_member(pg_temp.id('L'), pg_temp.u(3))$$, 'P0001', 'Only the league owner can do that.',
  'only the owner removes members');

select pg_temp.act(1);
select public.leave_league(pg_temp.id('L'));
select is((select owner_id from public.leagues where id = pg_temp.id('S')), pg_temp.u(1), 'leaving one league keeps your others');
select pg_temp.act(2);
select is((select owner_id from public.leagues where id = pg_temp.id('L')), pg_temp.u(2),
  'ownership passes to the longest-standing member who has not left');

-- A queued member who leaves goes at once.
select pg_temp.act(6);
select public.leave_league(pg_temp.id('S'));
select is((select count(*)::int from public.league_members where league_id = pg_temp.id('S') and user_id = pg_temp.u(6)), 0,
  'a queued member who leaves is removed at once');

-- Rejoining before the season ends puts you back in the rotation.
select pg_temp.act(4);
select public.join_league(pg_temp.code('L'));
select is((select status from public.league_standings(pg_temp.id('L')) where display_name = 'Delta'), 'active',
  'rejoining mid-season undoes leaving');

-------------------------------------------------------------------------------
-- The next season
-------------------------------------------------------------------------------

reset role;
insert into public.seasons (number, starts_at) values (2, now() - interval '1 day');
select results_eq(
  $$select user_id, status::text from public.league_members where league_id = pg_temp.id('L') order by joined_at$$,
  $$values ('00000000-0000-0000-0000-000000000002'::uuid, 'queued'), ('00000000-0000-0000-0000-000000000003'::uuid, 'queued'),
           ('00000000-0000-0000-0000-000000000004'::uuid, 'queued')$$,
  'members who left are gone, and a league below four waits'
);
select ok((select bool_and(active_from_season_id is null) from public.league_members where league_id = pg_temp.id('L')),
  'a waiting league has no starting season');
select ok((select bool_and(status = 'queued') from public.league_members where league_id = pg_temp.id('S')),
  'so does the small league, now three');

select * from finish();
rollback;
