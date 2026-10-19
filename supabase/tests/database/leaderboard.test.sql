-- The global leaderboard, ranked by edge: on each fight you pick, your points
-- minus the average of everyone who picked it, summed. A card counts only if
-- you picked its whole main card, and a fight only once 3 such players
-- picked it. Unnamed and deleted accounts are left out, your own row is
-- always included, and only the current season counts once one is open.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
-- Three main card fights (a, b, c) and a prelim (d).
create function pg_temp.card(ev text, fight text, starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', starts, 'status', 'complete',
    'issues', '[]'::jsonb, 'bouts', (
      select jsonb_agg(jsonb_build_object('ufcFightId', fight || x.l, 'order', x.o,
        'segment', case when x.o <= 3 then 'main' else 'prelims' end, 'scheduledRounds', 3, 'weightClass', null,
        'red', pg_temp.f(fight || 'r' || x.o), 'blue', pg_temp.f(fight || 'b' || x.o)))
      from (values (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd')) x(o, l)))
$$;
select public.sync_event_card(pg_temp.card('lbA', 'la', now() - interval '20 days'));

create function pg_temp.u(n text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || n || '1')::uuid
$$;
insert into auth.users (id, email)
select pg_temp.u(n), n || '@example.test' from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) n;
update public.profiles p set display_name = v.name
from (values ('a', 'Alpha'), ('b', 'Bravo'), ('c', 'Charlie'), ('d', 'Delta'), ('f', 'Foxtrot')) v(n, name)
where p.id = pg_temp.u(v.n);
-- e1 never picked a name.

-- Picks on the given fights, saved straight in: the card has already locked.
create function pg_temp.pick(n text, fights text[]) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY'::public.finish_kind
  from public.bouts b where b.ufc_fight_id = any (fights)
$$;
create function pg_temp.score(n text, fight text, points int) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select pg_temp.u(n), b.id, e.season_id, points, points, '{}', points > 0, true
  from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = fight
$$;

set local session_replication_role = replica;
-- Alpha, Bravo and Charlie pick the whole main card; Alpha and Bravo the
-- prelim too. Foxtrot picks one fight, the e1 account two; Delta all three.
select pg_temp.pick(n, array['laa', 'lab', 'lac']) from unnest(array['a', 'b', 'c', 'd']) n;
select pg_temp.pick(n, array['lad']) from unnest(array['a', 'b']) n;
select pg_temp.pick('f', array['laa']);
select pg_temp.pick('e', array['laa', 'lab']);
set local session_replication_role = origin;

-- Fight a: 125, 50, -50, average 41.67. Fight b: 25, 50, 50, average 41.67.
-- Fight c: everyone wrong at -50, so nobody gains or loses. The prelim, with
-- only two pickers, doesn't count.
select pg_temp.score('a', 'laa', 125), pg_temp.score('a', 'lab', 25), pg_temp.score('a', 'lac', -50), pg_temp.score('a', 'lad', 125);
select pg_temp.score('b', 'laa', 50), pg_temp.score('b', 'lab', 50), pg_temp.score('b', 'lac', -50), pg_temp.score('b', 'lad', -50);
select pg_temp.score('c', 'laa', -50), pg_temp.score('c', 'lab', 50), pg_temp.score('c', 'lac', -50);
select pg_temp.score('f', 'laa', 125);
select pg_temp.score('e', 'laa', 125), pg_temp.score('e', 'lab', 125);

-- Delta deletes their account.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u('d'), 'role', 'authenticated')::text, true);
select public.delete_account();

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u('c'), 'role', 'authenticated')::text, true);

-- Alpha +83.33 - 16.67 = +67; Bravo +8.33 + 8.33 = +17; Charlie -91.67 + 8.33 = -83.
select results_eq(
  $$select rank, display_name, edge, points, cards, is_me from public.season_leaderboard()$$,
  $$values (1::bigint, 'Alpha', 67::bigint, 225::bigint, 1::bigint, false),
           (2::bigint, 'Bravo', 17::bigint, 0::bigint, 1::bigint, false),
           (3::bigint, 'Charlie', -83::bigint, -50::bigint, 1::bigint, true)$$,
  'ranked by edge: points above the average of everyone who picked the same fights'
);
select ok(not exists (select 1 from public.season_leaderboard() where user_id = pg_temp.u('f')),
  'a card without the whole main card doesn''t count, however well it went');
select is((select sum(edge)::int from public.season_leaderboard()), 1,
  'edges balance out around the field, give or take rounding');
select is((select distinct season_label from public.season_leaderboard()), 'PRE-SEASON', 'before season 1 it ranks the pre-season');
select results_eq(
  $$select display_name from public.season_leaderboard(1)$$,
  $$values ('Alpha'), ('Charlie')$$,
  'your own row is included even outside the top'
);
select ok(not exists (select 1 from public.season_leaderboard() where user_id in (pg_temp.u('d'), pg_temp.u('e'))),
  'deleted accounts and players with no name don''t appear');
reset role;

-- Season 1 opens; only its cards count. Everyone level on every fight.
insert into public.seasons (number, starts_at) values (1, now() - interval '10 days');
select public.sync_event_card(pg_temp.card('lbB', 'lb', now() - interval '5 days'));
select public.assign_season_slots();
set local session_replication_role = replica;
select pg_temp.pick(n, array['lba', 'lbb', 'lbc']) from unnest(array['a', 'b', 'c']) n;
set local session_replication_role = origin;
select pg_temp.score(n, f, 50) from unnest(array['a', 'b', 'c']) n, unnest(array['lba', 'lbb', 'lbc']) f;

set local role authenticated;
select results_eq(
  $$select rank, display_name, edge, season_label from public.season_leaderboard()$$,
  $$values (1::bigint, 'Alpha', 0::bigint, 'SEASON 1'),
           (1::bigint, 'Bravo', 0::bigint, 'SEASON 1'),
           (1::bigint, 'Charlie', 0::bigint, 'SEASON 1')$$,
  'once a season opens only its cards count, and players level on edge and accuracy share a rank'
);
reset role;

set local role anon;
select throws_ok($$select * from public.season_leaderboard()$$, '42501', null, 'signed-out callers cannot read it');
reset role;

select * from finish();
rollback;
