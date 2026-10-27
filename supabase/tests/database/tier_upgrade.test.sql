-- Moving a league up a tier: only the owner, only up, never Hardcore; at once
-- in the pre-season, from the next season otherwise, with the cards already in
-- a season keeping the tier they were played at; calling it off; Pro's default
-- minimum; who hears about it; and older builds' inbox.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Only this file's cards count.
update public.events set status = 'cancelled';

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000a1'::uuid $$;
create function pg_temp.b() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000a2'::uuid $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.tier(l uuid) returns text language sql as $$ select tier::text from public.leagues where id = l $$;
-- Who heard about it. Players can't read the table, so this runs after reset role.
create function pg_temp.told(l uuid, phase text) returns int[] language sql as $$
  select coalesce(array_agg(right(n.user_id::text, 2)::int order by n.user_id), '{}')
  from public.notifications_sent n
  where n.kind = 'tier' and n.payload ->> 'leagueId' = l::text and n.payload ->> 'phase' = phase
$$;
create function pg_temp.ev(code text) returns uuid language sql as $$
  select id from public.events where ufc_event_id = code
$$;
create function pg_temp.required(l uuid, code text) returns int[] language sql as $$
  select array_agg(b.fight_order order by b.fight_order)
  from public.league_required_bouts(l, pg_temp.ev(code)) r(id) join public.bouts b on b.id = r.id
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'tu' || n || '@example.test' from generate_series(1, 5) n;
update public.profiles p set display_name = 'Climber' || v.n from generate_series(1, 5) v(n) where p.id = pg_temp.u(v.n);

-- A: Casual, owned by 01, members 01-04. B: Casual, owned by 01, members 01, 05.
insert into public.leagues (id, name, owner_id, tier)
values (pg_temp.a(), 'Climb A', pg_temp.u(1), 'casual'), (pg_temp.b(), 'Climb B', pg_temp.u(1), 'casual');
insert into public.league_members (league_id, user_id)
select pg_temp.a(), pg_temp.u(n) from generate_series(1, 4) n
union all values (pg_temp.b(), pg_temp.u(1)), (pg_temp.b(), pg_temp.u(5));

-- The next card: orders 1-2 main card, 3-6 prelims.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'tu-next', 'name', 'Card next', 'startsAt', now() + interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'tu-next' || o, 'order', o,
      'segment', case when o <= 2 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'tunr' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'tunb' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 6) o)));

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.schedule_tier_upgrade(uuid, public.league_tier)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_tier_upgrade(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.my_league_tiers()', 'execute')
  and has_function_privilege('authenticated', 'public.inbox_items_v4(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.inbox_unread_count_v4()', 'execute'),
  'authenticated can schedule, cancel, read upgrades and read the new inbox');
select ok(not has_function_privilege('anon', 'public.schedule_tier_upgrade(uuid, public.league_tier)', 'execute')
  and not has_function_privilege('anon', 'public.my_league_tiers()', 'execute')
  and not has_function_privilege('anon', 'public.inbox_items_v4(integer)', 'execute'),
  'anon cannot');
select ok(not has_function_privilege('authenticated', 'public.league_tier_for(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.sync_league_tier(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_league_tier(uuid, public.league_tier, text, integer, text, uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.league_tiers', 'select'),
  'nobody calls the helpers or reads the table directly');

-------------------------------------------------------------------------------
-- Pre-season: at once
-------------------------------------------------------------------------------

select is(public.current_season(), null, 'the fixture runs in the pre-season');
select is((select tier::text from public.league_tiers where league_id = pg_temp.a() and from_season = 0), 'casual',
  'a new league plays its tier from the start');
select is(pg_temp.required(pg_temp.a(), 'tu-next'), array[1, 2], 'a Casual league requires the main card');

set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$ select public.schedule_tier_upgrade(pg_temp.a(), 'pro') $$, 'P0001',
  'Only the league''s owner can change its tier.', 'a member who isn''t the owner is refused');

select pg_temp.as_user(1);
select throws_ok($$ select public.schedule_tier_upgrade(pg_temp.a(), 'casual') $$, 'P0001',
  'A league can only move up a tier.', 'the same tier is refused');
select throws_ok($$ select public.schedule_tier_upgrade(pg_temp.a(), 'hardcore') $$, 'P0001',
  'Hardcore leagues aren''t open yet.', 'Hardcore is refused');

select is(public.schedule_tier_upgrade(pg_temp.a(), 'amateur'), 0, 'in the pre-season it applies at once');
select is(pg_temp.tier(pg_temp.a()), 'amateur', 'A is Amateur');
select results_eq(
  $$ select card_tier::text, tier_now::text, next_tier::text from public.my_league_tiers() where league_id = pg_temp.a() $$,
  $$ values ('amateur'::text, 'amateur'::text, null::text) $$, 'with nothing waiting');
reset role;
select is(pg_temp.required(pg_temp.a(), 'tu-next'), array[1, 2, 3, 4, 5], 'and its next card requires Amateur''s picks');
select is(pg_temp.told(pg_temp.a(), 'started'), array[2, 3, 4], 'every member but the owner hears it started');
set local role authenticated;
select throws_ok($$ select public.schedule_tier_upgrade(pg_temp.a(), 'casual') $$, 'P0001',
  'A league can only move up a tier.', 'moving back down is refused');

select is(public.schedule_tier_upgrade(pg_temp.a(), 'pro'), 0, 'Amateur can move up to Pro');
reset role;
select is((select scope from public.league_pick_rules where league_id = pg_temp.a() order by effective_at desc limit 1),
  'main_card', 'a league moving up to Pro starts on the main card');
select is(pg_temp.required(pg_temp.a(), 'tu-next'), array[1, 2], 'which is what its next card requires');

-------------------------------------------------------------------------------
-- In a season: from the next one
-------------------------------------------------------------------------------

-- Season 1 has played all 11 cards, so the next card opens Season 2.
insert into public.seasons (number, starts_at) values (1, now() - interval '80 days');
insert into public.events (name, starts_at, locks_at, ufc_event_id, season_id, season_index, status)
select 'Card s1-' || i, now() - interval '1 day' * (78 - i * 7), now() - interval '1 day' * (78 - i * 7),
       'tu-s1-' || i, (select id from public.seasons where number = 1), i, 'complete'
from generate_series(1, 11) i;

select is(public.card_season_number(pg_temp.ev('tu-s1-5')), 1, 'a slotted card is in its season');
select is(public.card_season_number(pg_temp.ev('tu-next')), 2, 'the card after the 11th opens the next one');
select is(public.season_in_play(), 1, 'Season 1 is being played');

-- Until the cron slots it, a locked card still counts toward its season.
update public.events set season_id = null, season_index = null where ufc_event_id = 'tu-s1-11';
select is(public.card_season_number(pg_temp.ev('tu-s1-11')) || ':' || public.card_season_number(pg_temp.ev('tu-next')),
  '1:2', 'an unslotted locked card is the season''s 11th, and the next card still opens Season 2');
update public.events set season_id = (select id from public.seasons where number = 1), season_index = 11
where ufc_event_id = 'tu-s1-11';

set local role authenticated;
select pg_temp.as_user(1);

select is(public.schedule_tier_upgrade(pg_temp.b(), 'pro'), 2, 'during a season it waits for the next');
select is(pg_temp.tier(pg_temp.b()), 'casual', 'B is still Casual');
select results_eq(
  $$ select card_tier::text, tier_now::text, next_tier::text, next_season from public.my_league_tiers() where league_id = pg_temp.b() $$,
  $$ values ('pro'::text, 'casual'::text, 'pro'::text, 2) $$,
  'the owner reads Pro from Season 2, and the next card, Season 2''s first, plays it');
reset role;
select is(public.league_tier_for(pg_temp.b(), pg_temp.ev('tu-s1-5')), 'casual', 'Season 1''s cards keep Casual');
select is(public.league_season_tier(pg_temp.b(), (select id from public.seasons where number = 1)), 'casual',
  'and so does Season 1''s table');
select is(pg_temp.told(pg_temp.b(), 'scheduled'), array[5], 'the other member hears it is coming');
set local role authenticated;

select public.schedule_tier_upgrade(pg_temp.b(), 'pro');
reset role;
select is(pg_temp.told(pg_temp.b(), 'scheduled'), array[5], 'asking for the same tier again tells nobody twice');
set local role authenticated;

select pg_temp.as_user(5);
select throws_ok($$ select public.cancel_tier_upgrade(pg_temp.b()) $$, 'P0001',
  'Only the league''s owner can change its tier.', 'only the owner can call it off');
select pg_temp.as_user(1);
select public.cancel_tier_upgrade(pg_temp.b());
select results_eq(
  $$ select card_tier::text, next_tier::text from public.my_league_tiers() where league_id = pg_temp.b() $$,
  $$ values ('casual'::text, null::text) $$, 'called off, the next card is Casual again');
reset role;
select is(pg_temp.told(pg_temp.b(), 'cancelled'), array[5], 'the member hears it was called off');
set local role authenticated;

select public.schedule_tier_upgrade(pg_temp.b(), 'amateur');
reset role;
select is(pg_temp.required(pg_temp.b(), 'tu-next'), array[1, 2, 3, 4, 5], 'Season 2''s first card requires Amateur''s picks');
set local role authenticated;
select lives_ok($$ select public.set_league_pick_rule(pg_temp.a(), 'whole_card') $$, 'a Pro league sets its minimum');
select throws_ok($$ select public.set_league_pick_rule(pg_temp.b(), 'whole_card') $$, 'P0001',
  'Only Pro leagues set their own minimum picks.', 'a league moving up to Amateur doesn''t');

-- The next card locks and opens Season 2.
reset role;
update public.events set locks_at = now() - interval '1 minute' where ufc_event_id = 'tu-next';
insert into public.seasons (number, starts_at) values (2, now() - interval '1 minute');
update public.events set season_id = (select id from public.seasons where number = 2), season_index = 1
where ufc_event_id = 'tu-next';

select is(pg_temp.tier(pg_temp.b()), 'amateur', 'Season 2 opens B at Amateur');
select is(pg_temp.told(pg_temp.b(), 'started'), array[1, 5], 'everyone, owner too, hears it started');
select is(public.league_tier_for(pg_temp.b(), pg_temp.ev('tu-s1-5')), 'casual', 'Season 1''s cards still play Casual');
select is(public.league_tier_for(pg_temp.b(), pg_temp.ev('tu-next')), 'amateur', 'Season 2''s play Amateur');

set local role authenticated;
select pg_temp.as_user(1);
select results_eq(
  $$ select tier_now::text, next_tier::text from public.my_league_tiers() where league_id = pg_temp.b() $$,
  $$ values ('amateur'::text, null::text) $$, 'nothing is waiting any more');
select public.cancel_tier_upgrade(pg_temp.b());
select is(pg_temp.tier(pg_temp.b()), 'amateur', 'and once a season has started it can''t be called off');
select throws_ok($$ select public.schedule_tier_upgrade(pg_temp.b(), 'amateur') $$, 'P0001',
  'A league can only move up a tier.', 'and it can''t move back down');
select is(public.schedule_tier_upgrade(pg_temp.b(), 'pro'), 3, 'the next move up waits for Season 3');
select lives_ok($$ select public.set_league_pick_rule(pg_temp.b(), 'whole_card') $$,
  'a league moving up to Pro can set its minimum before it starts');

-------------------------------------------------------------------------------
-- Older builds
-------------------------------------------------------------------------------

select pg_temp.as_user(5);
select ok(exists (select 1 from public.inbox_items_v4(200) where kind = 'tier'), 'this build''s inbox shows tier news');
select ok(not exists (select 1 from public.inbox_items_v3(200) where kind = 'tier')
  and not exists (select 1 from public.my_notifications(200) where kind = 'tier'),
  'an older build''s inbox does not');
select ok(public.inbox_unread_count_v4() > public.inbox_unread_count_v3()
  and public.inbox_unread_count_v3() = public.inbox_unread_count_v2(),
  'nor does an older build''s unread count');

select * from finish();
rollback;
