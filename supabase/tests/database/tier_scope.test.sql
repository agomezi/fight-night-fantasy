-- Which part of the card each tier plays, and the picks it requires:
-- Casual the main card, all of it; Amateur the main card and the last 3
-- prelims, all of them; Pro and Hardcore the whole card, the main event
-- required. Cancelled bouts don't count either way.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Orders 1-2 main card, 3-6 prelims, 7-8 early prelims. Order 1 is the main
-- event; 3, 4 and 5 are the prelims nearest the main card.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'ts1', 'name', 'Card ts1', 'startsAt', now() + interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'ts1' || o, 'order', o,
      'segment', case when o <= 2 then 'main' when o <= 6 then 'prelims' else 'early_prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'ts1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'ts1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 8) o)));

create function pg_temp.bid(o int) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = 'ts1' || o
$$;
create function pg_temp.ev() returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'ts1'
$$;
create function pg_temp.counted(t public.league_tier) returns int[] language sql as $$
  select array_agg(b.fight_order order by b.fight_order) from public.bouts b
  where b.event_id = pg_temp.ev() and public.bout_counts_for_tier(t, b.id)
$$;
insert into auth.users (id, email) select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'ts' || n || '@example.test' from generate_series(1, 4) n;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- Picks the given bouts for player n.
create function pg_temp.pick(n int, orders int[]) returns void language sql as $$
  insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
  select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'DEC'
  from public.bouts b where b.event_id = pg_temp.ev() and b.fight_order = any (orders)
$$;
create function pg_temp.met(t public.league_tier, n int) returns boolean language sql as $$
  select public.met_tier_picks(t, pg_temp.u(n), pg_temp.ev())
$$;

select is(pg_temp.counted('casual'), array[1, 2], 'Casual plays the main card');
select is(pg_temp.counted('amateur'), array[1, 2, 3, 4, 5], 'Amateur adds the three prelims nearest it');
select is(pg_temp.counted('pro'), array[1, 2, 3, 4, 5, 6, 7, 8], 'Pro plays the whole card');
select is(pg_temp.counted('hardcore'), array[1, 2, 3, 4, 5, 6, 7, 8], 'and so does Hardcore');

-- 1 picked the main card; 2 the main card and the last 3 prelims; 3 only a
-- prelim; 4 nothing.
select pg_temp.pick(1, array[1, 2]);
select pg_temp.pick(2, array[1, 2, 3, 4, 5]);
select pg_temp.pick(3, array[6]);

select ok(pg_temp.met('casual', 1), 'the whole main card meets Casual');
select ok(not pg_temp.met('amateur', 1), 'but not Amateur');
select ok(pg_temp.met('amateur', 2), 'which needs the last 3 prelims too');
select ok(pg_temp.met('pro', 1), 'Pro needs only the main event');
select ok(not pg_temp.met('pro', 3), 'so a prelim alone isn''t enough');
select ok(not pg_temp.met('casual', 4) and not pg_temp.met('pro', 4), 'and no picks meets nothing');

-- 4 picks only the main event: enough for Pro, not for Casual.
select pg_temp.pick(4, array[1]);
select ok(pg_temp.met('pro', 4) and not pg_temp.met('casual', 4), 'the main event alone is Pro''s minimum, not Casual''s');

-- A cancelled bout drops out: with order 2 gone, the main event is the
-- whole main card, and the next prelim moves up into Amateur's three.
update public.bouts set status = 'cancelled' where id = pg_temp.bid(2);
select ok(pg_temp.met('casual', 4), 'a cancelled bout isn''t required');
update public.bouts set status = 'cancelled' where id = pg_temp.bid(3);
select is(pg_temp.counted('amateur'), array[1, 2, 4, 5, 6], 'a cancelled prelim makes room for the next one');
select ok(not pg_temp.met('amateur', 2), 'which then has to be picked too');

select throws_ok($$select public.met_tier_picks('pro', pg_temp.u(1), pg_temp.ev())$$, '42501', null,
  'players can''t call these') from (select set_config('role', 'authenticated', true)) r;

select * from finish();
rollback;
