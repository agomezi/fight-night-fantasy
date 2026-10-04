-- Section locks: each bout locks when its own part of the card starts, a
-- locked bout's time is frozen, and a bout with no lock of its own falls back
-- to the event's.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.bout(fight text, ord int, seg text, locks timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'order', ord, 'segment', seg, 'scheduledRounds', 3,
    'weightClass', null, 'red', pg_temp.f('r' || fight), 'blue', pg_temp.f('b' || fight), 'locksAt', locks)
$$;
create function pg_temp.card(early timestamptz, prelims timestamptz, main timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', 's1', 'name', 'Section Card', 'startsAt', early, 'status', 'live',
    'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
      pg_temp.bout('s11', 1, 'main', main),
      pg_temp.bout('s12', 2, 'prelims', prelims),
      pg_temp.bout('s13', 3, 'early_prelims', early)))
$$;
create function pg_temp.b(fight text) returns public.bouts language sql as $$
  select * from public.bouts where ufc_fight_id = fight
$$;

-- Early prelims started an hour ago; prelims in an hour; main card in three.
select public.sync_event_card(pg_temp.card(now() - interval '1 hour', now() + interval '1 hour', now() + interval '3 hours'));

select is((pg_temp.b('s13')).locks_at, now() - interval '1 hour', 'early prelims lock at their start');
select is((pg_temp.b('s12')).locks_at, now() + interval '1 hour', 'prelims lock at theirs');
select is((pg_temp.b('s11')).locks_at, now() + interval '3 hours', 'the main card locks at its own start');
select is((select locks_at from public.events where ufc_event_id = 's1'), now() - interval '1 hour',
  'the event still locks at its earliest section');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'gia@example.test');
create function pg_temp.pick(fight text) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select '00000000-0000-0000-0000-0000000000f1', b.id, b.version, b.red_fighter_id, 'ANY'
  from public.bouts b where b.ufc_fight_id = fight
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}', true);

select lives_ok($$select pg_temp.pick('s11')$$, 'the main card can still be picked once the early prelims have started');
select lives_ok($$select pg_temp.pick('s12')$$, 'so can the prelims');
select throws_ok($$select pg_temp.pick('s13')$$, 'P0001', 'picks are locked for this event',
  'an early prelim bout cannot be picked once it has started');
reset role;

-- The feed moves every section later. The open sections follow; the locked
-- one stays locked.
select public.sync_event_card(pg_temp.card(now() + interval '30 minutes', now() + interval '2 hours', now() + interval '4 hours'));
select is((pg_temp.b('s13')).locks_at, now() - interval '1 hour', 'a locked bout''s time does not move');
select is((pg_temp.b('s11')).locks_at, now() + interval '4 hours', 'an open bout''s time follows the feed');

-- A bout entered by hand has no lock of its own and goes by the event's.
update public.bouts set locks_at = null where ufc_fight_id = 's12';
update public.events set locks_at = now() - interval '1 minute', starts_at = now() - interval '1 minute' where ufc_event_id = 's1';
set local role authenticated;
select throws_ok(
  $$update public.picks set finish = 'DEC' where bout_id = (select id from public.bouts where ufc_fight_id = 's12')$$,
  'P0001', 'picks are locked for this event',
  'a bout with no lock of its own falls back to the event lock'
);
reset role;

select * from finish();
rollback;
