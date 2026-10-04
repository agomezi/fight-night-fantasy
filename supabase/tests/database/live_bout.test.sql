-- The fight in the cage: kept on the event while live, cleared between fights.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lb1', 'name', 'Live Card', 'startsAt', now() - interval '1 hour', 'status', 'live',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    jsonb_build_object('ufcFightId', 'lb11', 'order', 1, 'segment', 'main', 'scheduledRounds', 5,
      'weightClass', null, 'red', pg_temp.f('lr1'), 'blue', pg_temp.f('lbb1')),
    jsonb_build_object('ufcFightId', 'lb12', 'order', 2, 'segment', 'main', 'scheduledRounds', 3,
      'weightClass', null, 'red', pg_temp.f('lr2'), 'blue', pg_temp.f('lbb2')))));

create function pg_temp.live(fight text) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', 'lb1', 'status', 'live', 'liveFightId', fight, 'bouts', '[]'::jsonb)
$$;

select public.record_event_results(pg_temp.live('lb12'));
select is((select live_bout_id from public.events where ufc_event_id = 'lb1'),
  (select id from public.bouts where ufc_fight_id = 'lb12'), 'the live bout is kept on the event');

select public.record_event_results(pg_temp.live(null));
select is((select live_bout_id from public.events where ufc_event_id = 'lb1'), null, 'it clears between fights');

set local role anon;
select lives_ok($$select live_bout_id from public.events$$, 'anyone can read which bout is live');
reset role;

select * from finish();
rollback;
