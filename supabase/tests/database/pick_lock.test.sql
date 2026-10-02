-- Server-side pick lock: once an event locks, a signed-in user can no longer
-- add, change or remove picks on it, and nobody can pick a cancelled bout.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.events (id, name, starts_at, locks_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'Open card',   '2099-01-01 20:00Z', '2099-01-01 20:00Z'),
  ('00000000-0000-0000-0000-0000000000e2', 'Locked card', '2020-01-01 20:00Z', '2020-01-01 20:00Z');

insert into public.fighters (id, name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Red'),
  ('00000000-0000-0000-0000-0000000000f2', 'Blue');

insert into public.bouts (id, event_id, fight_order, card_segment, red_fighter_id, blue_fighter_id, status) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 1, 'main',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'scheduled'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 2, 'main',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'cancelled'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', 1, 'main',
   '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'scheduled');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test');

-- A pick made before the lock, written directly as it would have been then.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 1,
   '00000000-0000-0000-0000-0000000000f1', 'DEC');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

-- Open event
select lives_ok(
  $$insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
            '00000000-0000-0000-0000-0000000000f1', 'ANY')$$,
  'a pick on an open event is saved'
);
select lives_ok(
  $$update public.picks set finish = 'round', finish_round = 2, method = 'KO'
    where bout_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'and can be changed'
);
select lives_ok(
  $$insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
            '00000000-0000-0000-0000-0000000000f2', 'DEC')
    on conflict (user_id, bout_id) do update
      set picked_fighter_id = excluded.picked_fighter_id, finish = excluded.finish,
          finish_round = null, method = null$$,
  'and upserted, which is how the app saves a card'
);
select lives_ok(
  $$delete from public.picks where bout_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'and removed'
);

-- Cancelled bout
select throws_ok(
  $$insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 1,
            '00000000-0000-0000-0000-0000000000f1', 'ANY')$$,
  'P0001', 'bout 00000000-0000-0000-0000-0000000000b2 is cancelled',
  'a cancelled bout cannot be picked'
);

-- Locked event
select throws_ok(
  $$insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 1,
            '00000000-0000-0000-0000-0000000000f2', 'ANY')
    on conflict (user_id, bout_id) do update set picked_fighter_id = excluded.picked_fighter_id$$,
  'P0001', 'picks are locked for this event',
  'a locked event rejects an upsert'
);
select throws_ok(
  $$update public.picks set finish = 'ANY' where bout_id = '00000000-0000-0000-0000-0000000000b3'$$,
  'P0001', 'picks are locked for this event',
  'a locked event rejects a change'
);
select throws_ok(
  $$delete from public.picks where bout_id = '00000000-0000-0000-0000-0000000000b3'$$,
  'P0001', 'picks are locked for this event',
  'a locked event rejects a removal'
);
select throws_ok(
  $$update public.picks set bout_id = '00000000-0000-0000-0000-0000000000b1'
    where bout_id = '00000000-0000-0000-0000-0000000000b3'$$,
  'P0001', 'picks are locked for this event',
  'a pick cannot be moved out of a locked event'
);
select is(
  (select finish::text from public.picks where bout_id = '00000000-0000-0000-0000-0000000000b3'),
  'DEC', 'the locked pick is unchanged'
);

-- Locking is a property of the event, so an event whose lock moves into the
-- past locks its picks with it.
reset role;
update public.events set locks_at = '2020-06-01 20:00Z', starts_at = '2020-06-01 20:00Z'
where id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
select throws_ok(
  $$insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 1,
            '00000000-0000-0000-0000-0000000000f1', 'ANY')$$,
  'P0001', 'picks are locked for this event',
  'the lock follows the event''s locks_at'
);
reset role;

-- Internal work is not held to the lock.
select lives_ok(
  $$delete from public.picks where bout_id = '00000000-0000-0000-0000-0000000000b3'$$,
  'the owner can still remove a locked pick (rollover purge, cascades)'
);
set local role service_role;
select is(
  (select count(*)::int from public.picks where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'and nothing is left behind'
);
reset role;

select * from finish();
rollback;
