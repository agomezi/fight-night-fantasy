-- Fighter profiles: card sync stores a fighter's record and measurements,
-- keeps them current, and a card without them leaves what is stored alone.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

create function pg_temp.card(profile jsonb) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', 'fp', 'name', 'Card fp', 'startsAt', now() + interval '3 days',
    'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object(
      'ufcFightId', 'fp1', 'order', 1, 'segment', 'main', 'scheduledRounds', 5, 'weightClass', 'Middleweight',
      'red', jsonb_strip_nulls(jsonb_build_object('ufcFighterId', 'fpr', 'name', 'Brendan Allen', 'nickname', null,
                                                  'profile', profile)),
      'blue', jsonb_build_object('ufcFighterId', 'fpb', 'name', 'Blue Fighter', 'nickname', null))))
$$;
create function pg_temp.allen() returns text language sql as $$
  select concat_ws(' ', wins, losses, draws, no_contests, dob, height_in, reach_in, stance)
  from public.fighters where ufc_fighter_id = 'fpr'
$$;

set local role service_role;

select public.sync_event_card(pg_temp.card(
  '{"wins": 27, "losses": 7, "draws": 0, "noContests": 0, "dob": "1995-12-28", "heightIn": 74, "reachIn": 75, "stance": "Orthodox"}'));
select is(pg_temp.allen(), '27 7 0 0 1995-12-28 74.0 75.0 Orthodox', 'the record and measurements are stored');

select public.sync_event_card(pg_temp.card(
  '{"wins": 28, "losses": 7, "draws": 0, "noContests": 0, "dob": "1995-12-28", "heightIn": 74, "reachIn": 75, "stance": "Orthodox"}'));
select is(pg_temp.allen(), '28 7 0 0 1995-12-28 74.0 75.0 Orthodox', 'a new win is picked up');

select public.sync_event_card(pg_temp.card(null));
select is(pg_temp.allen(), '28 7 0 0 1995-12-28 74.0 75.0 Orthodox', 'a card without a record keeps what is stored');

select * from finish();
rollback;
