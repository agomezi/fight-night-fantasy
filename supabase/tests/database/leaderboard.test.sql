-- The global leaderboard: ranked by points with accuracy breaking ties,
-- unnamed and deleted accounts left out, your own row always included, and
-- the current season only once one is open.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.card(ev text, fight text, starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', ev, 'name', 'Card ' || ev, 'startsAt', starts, 'status', 'complete',
    'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
      jsonb_build_object('ufcFightId', fight || 'a', 'order', 1, 'segment', 'main', 'scheduledRounds', 5,
        'weightClass', null, 'red', pg_temp.f(fight || 'r1'), 'blue', pg_temp.f(fight || 'b1')),
      jsonb_build_object('ufcFightId', fight || 'b', 'order', 2, 'segment', 'main', 'scheduledRounds', 3,
        'weightClass', null, 'red', pg_temp.f(fight || 'r2'), 'blue', pg_temp.f(fight || 'b2')),
      jsonb_build_object('ufcFightId', fight || 'c', 'order', 3, 'segment', 'main', 'scheduledRounds', 3,
        'weightClass', null, 'red', pg_temp.f(fight || 'r3'), 'blue', pg_temp.f(fight || 'b3'))))
$$;
select public.sync_event_card(pg_temp.card('lbA', 'la', now() - interval '20 days'));

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'e@example.test');
update public.profiles set display_name = 'Alpha' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Bravo' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set display_name = 'Charlie' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set display_name = 'Delta' where id = '00000000-0000-0000-0000-0000000000d1';
-- e1 never picked a name.

create function pg_temp.score(usr text, fight text, points int, correct boolean) returns void language sql as $$
  insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
  select usr::uuid, b.id, e.season_id, points, points, '{}', correct, true
  from public.bouts b join public.events e on e.id = b.event_id where b.ufc_fight_id = fight
$$;
-- Alpha: 100 points, 2 of 3. Bravo: 100 points, 2 of 2. Charlie: -50.
select pg_temp.score('00000000-0000-0000-0000-0000000000a1', 'laa', 125, true);
select pg_temp.score('00000000-0000-0000-0000-0000000000a1', 'lab', 25, true);
select pg_temp.score('00000000-0000-0000-0000-0000000000a1', 'lac', -50, false);
select pg_temp.score('00000000-0000-0000-0000-0000000000b1', 'laa', 50, true);
select pg_temp.score('00000000-0000-0000-0000-0000000000b1', 'lab', 50, true);
select pg_temp.score('00000000-0000-0000-0000-0000000000c1', 'laa', -50, false);
select pg_temp.score('00000000-0000-0000-0000-0000000000d1', 'laa', 125, true);
select pg_temp.score('00000000-0000-0000-0000-0000000000e1', 'laa', 125, true);

-- Delta deletes their account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}', true);
select public.delete_account();

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);

select results_eq(
  $$select rank, display_name, points, correct, counted, cards, is_me from public.season_leaderboard()$$,
  $$values (1::bigint, 'Bravo', 100::bigint, 2::bigint, 2::bigint, 1::bigint, false),
           (2::bigint, 'Alpha', 100::bigint, 2::bigint, 3::bigint, 1::bigint, false),
           (3::bigint, 'Charlie', -50::bigint, 0::bigint, 1::bigint, 1::bigint, true)$$,
  'ranked by points, accuracy breaking the tie, deleted and unnamed accounts left out'
);
select is((select distinct season_label from public.season_leaderboard()), 'PRE-SEASON', 'before season 1 it ranks the pre-season');

select results_eq(
  $$select display_name from public.season_leaderboard(1)$$,
  $$values ('Bravo'), ('Charlie')$$,
  'your own row is included even outside the top'
);
select ok(not exists (select 1 from public.season_leaderboard() where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'a player with no name does not appear');
reset role;

-- Season 1 opens; only its cards count.
insert into public.seasons (number, starts_at) values (1, now() - interval '10 days');
select public.sync_event_card(pg_temp.card('lbB', 'lb', now() - interval '5 days'));
select public.assign_season_slots();
select pg_temp.score('00000000-0000-0000-0000-0000000000c1', 'lba', 125, true);

set local role authenticated;
select results_eq(
  $$select display_name, points, season_label from public.season_leaderboard()$$,
  $$values ('Charlie', 125::bigint, 'SEASON 1')$$,
  'once a season opens, only its cards count'
);
reset role;

-- Players level on points and accuracy share a rank.
select pg_temp.score('00000000-0000-0000-0000-0000000000a1', 'lba', 125, true);
set local role authenticated;
select results_eq(
  $$select rank, display_name from public.season_leaderboard()$$,
  $$values (1::bigint, 'Alpha'), (1::bigint, 'Charlie')$$,
  'players level on both share a rank'
);
reset role;

set local role anon;
select throws_ok($$select * from public.season_leaderboard()$$, '42501', null, 'signed-out callers cannot read it');
reset role;

select * from finish();
rollback;
