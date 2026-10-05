-- Casual points: stored beside the full points when an event's scores are
-- replaced, and falling back to the full points from a sync that sends none.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
select public.sync_event_card(jsonb_build_object('ufcEventId', 'cp', 'name', 'Card cp',
  'startsAt', now() - interval '1 day', 'status', 'complete', 'issues', '[]'::jsonb,
  'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'cp1', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', null, 'red', pg_temp.f('cpr'), 'blue', pg_temp.f('cpb')))));

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'bob@example.test');

create function pg_temp.ev() returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'cp'
$$;
create function pg_temp.bid() returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = 'cp1'
$$;
create function pg_temp.casual(usr text) returns int language sql as $$
  select casual_points from public.scores where user_id = usr::uuid and bout_id = pg_temp.bid()
$$;

set local role service_role;

select is(
  public.replace_event_scores(pg_temp.ev(), jsonb_build_array(
    jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a1', 'bout_id', pg_temp.bid(),
      'points', -95, 'casual_points', -47,
      'breakdown', '{"fighter": -50, "method": -30, "round": -15, "underdogBonus": 0}'::jsonb,
      'correct', false, 'counts_for_accuracy', true, 'provisional', false),
    -- From a sync deployed before casual points existed.
    jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a2', 'bout_id', pg_temp.bid(),
      'points', 125,
      'breakdown', '{"fighter": 50, "method": 50, "round": 25, "underdogBonus": 0}'::jsonb,
      'correct', true, 'counts_for_accuracy', true, 'provisional', false)
  )),
  '{"written": 2, "removed": 0}'::jsonb,
  'scores are written'
);
select is(pg_temp.casual('00000000-0000-0000-0000-0000000000a1'), -47, 'casual points are stored');
select is(pg_temp.casual('00000000-0000-0000-0000-0000000000a2'), 125, 'a row without them falls back to the full points');

-- The redeployed sync sends the real number, and only that row moves.
select is(
  public.replace_event_scores(pg_temp.ev(), jsonb_build_array(
    jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a1', 'bout_id', pg_temp.bid(),
      'points', -95, 'casual_points', -47,
      'breakdown', '{"fighter": -50, "method": -30, "round": -15, "underdogBonus": 0}'::jsonb,
      'correct', false, 'counts_for_accuracy', true, 'provisional', false),
    jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a2', 'bout_id', pg_temp.bid(),
      'points', 125, 'casual_points', 124,
      'breakdown', '{"fighter": 50, "method": 50, "round": 25, "underdogBonus": 0}'::jsonb,
      'correct', true, 'counts_for_accuracy', true, 'provisional', false)
  )),
  '{"written": 1, "removed": 0}'::jsonb,
  'a changed casual number alone rewrites the row'
);

select * from finish();
rollback;
