-- Minimum picks for Pro leagues, and forfeit wins counting half: which bouts
-- each rule requires, that a change never rewrites a card already started,
-- who can change it, and how a forfeit ranks.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

-- Orders 1-2 main card, 3-5 prelims. Opened in the future so picks can be
-- saved; the card locks below.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'pr1', 'name', 'UFC Fight Night: Pr vs. One', 'startsAt', now() + interval '1 day', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'pr1' || o, 'order', o,
      'segment', case when o <= 2 then 'main' else 'prelims' end,
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'pr1r' || o, 'name', 'Red ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'pr1b' || o, 'name', 'Blue ' || o, 'nickname', null)))
    from generate_series(1, 5) o)));

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'pr1' $$;
create function pg_temp.bid(o int) returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'pr1' || o $$;
create function pg_temp.lg() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000ee'::uuid $$;
create function pg_temp.casual() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000000ef'::uuid $$;

insert into auth.users (id, email) select pg_temp.u(n), 'pr' || n || '@example.test' from generate_series(1, 4) n;
update public.profiles p set display_name = 'Ruler' || v.n from generate_series(1, 4) v(n) where p.id = pg_temp.u(v.n);
-- A Pro league owned by 01, made before the card, and a Casual one.
insert into public.leagues (id, name, owner_id, tier, created_at)
values (pg_temp.lg(), 'Rule League', pg_temp.u(1), 'pro', now() - interval '3 days'),
       (pg_temp.casual(), 'Easy League', pg_temp.u(1), 'casual', now() - interval '3 days');
insert into public.league_members (league_id, user_id, joined_at)
select pg_temp.lg(), pg_temp.u(n), now() - interval '3 days' from generate_series(1, 4) n;

-- The required bouts' fight orders under the league's current rule.
create function pg_temp.required(league uuid) returns int[] language sql as $$
  select coalesce(array_agg(b.fight_order order by b.fight_order), '{}')
  from public.league_required_bouts(league, pg_temp.ev()) r(id) join public.bouts b on b.id = r.id
$$;
-- Sets the Pro league's rule as of before the card starts.
create function pg_temp.rule(scope text, n int default null) returns void language sql as $$
  insert into public.league_pick_rules (league_id, effective_at, scope, top_n)
  values (pg_temp.lg(), clock_timestamp(), scope, n::smallint)
$$;

-------------------------------------------------------------------------------
-- Which bouts each rule requires
-------------------------------------------------------------------------------

select is((select scope from public.league_pick_rules where league_id = pg_temp.lg()), 'main_card',
  'a new Pro league plays the main card');
select ok(not exists (select 1 from public.league_pick_rules where league_id = pg_temp.casual()),
  'Casual and Amateur keep their fixed range');
select is(pg_temp.required(pg_temp.lg()), array[1, 2], 'the main card requires every main card bout');
select pg_temp.rule('main_event');
select is(pg_temp.required(pg_temp.lg()), array[1], 'the main event only, as before');
select pg_temp.rule('top_n', 4);
select is(pg_temp.required(pg_temp.lg()), array[1, 2, 3, 4], 'top 4 reaches into the prelims');
select pg_temp.rule('whole_card');
select is(pg_temp.required(pg_temp.lg()), array[1, 2, 3, 4, 5], 'the whole card');
select is(pg_temp.required(pg_temp.casual()), array[1, 2], 'Casual is its main card whatever');

update public.bouts set status = 'cancelled' where id = pg_temp.bid(5);
select is(pg_temp.required(pg_temp.lg()), array[1, 2, 3, 4], 'a cancelled bout is never required');
update public.bouts set status = 'scheduled' where id = pg_temp.bid(5);

-------------------------------------------------------------------------------
-- A rule is the one in force when the card started
-------------------------------------------------------------------------------

select pg_temp.rule('main_card');
-- 01, 02 and 04 pick the main card; 03 only the main event.
insert into public.picks (user_id, bout_id, bout_version, picked_fighter_id, finish)
select pg_temp.u(n), b.id, b.version, b.red_fighter_id, 'ANY'::public.finish_kind from public.bouts b
cross join unnest(array[1, 2, 4]) n where b.event_id = pg_temp.ev() and b.fight_order <= 2
union all
select pg_temp.u(3), b.id, b.version, b.red_fighter_id, 'ANY'::public.finish_kind from public.bouts b where b.id = pg_temp.bid(1);

update public.bouts set locks_at = now() - interval '1 hour' where event_id = pg_temp.ev();
update public.events set locks_at = now() - interval '1 hour' where id = pg_temp.ev();

select ok(public.met_league_picks(pg_temp.lg(), pg_temp.u(1), pg_temp.ev()), 'the whole main card meets it');
select ok(not public.met_league_picks(pg_temp.lg(), pg_temp.u(3), pg_temp.ev()), 'the main event alone doesn''t');

-- Changed after the card started: this card keeps the main card.
insert into public.league_pick_rules (league_id, effective_at, scope) values (pg_temp.lg(), now(), 'main_event');
select ok(not public.met_league_picks(pg_temp.lg(), pg_temp.u(3), pg_temp.ev()),
  'a rule changed after the card started doesn''t rewrite it');

-------------------------------------------------------------------------------
-- Forfeits count half
-------------------------------------------------------------------------------

-- The card finishes: every pick scores 10, so the matchups are decided by
-- the required picks or by who scored more.
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy, provisional)
select k.user_id, k.bout_id, null, 10, 10, '{}'::jsonb, true, true, false from public.picks k
join public.bouts b on b.id = k.bout_id where b.event_id = pg_temp.ev();
update public.scores set points = case user_id when pg_temp.u(1) then 30 when pg_temp.u(2) then 20 else 10 end;
insert into public.results (bout_id, status, winner_fighter_id, method, round, source)
select b.id, 'final', b.red_fighter_id, 'DEC', null, 'ufc_live' from public.bouts b where b.event_id = pg_temp.ev();
update public.events set status = 'complete' where id = pg_temp.ev();

create temp table sched as
  select s.user_a, s.user_b, s.winner from public.league_schedule(pg_temp.lg(), null) s
  where s.event_id = pg_temp.ev();
create temp table tbl as select * from public.league_table(pg_temp.lg());

-- Whoever played 03 won by forfeit: 03 didn't make the main card. The
-- other matchup is a real win, everyone in it having different points.
select is((select array_agg(user_id) from tbl where forfeit_wins = 1),
  (select array_agg(case when user_a = pg_temp.u(3) then user_b else user_a end) from sched
   where pg_temp.u(3) in (user_a, user_b)),
  'a win over someone short of the required picks is a forfeit win');
select is((select forfeit_wins from tbl where user_id = pg_temp.u(3)), 0, 'and the one who forfeited has none');
select ok((select bool_and(t.wins >= t.forfeit_wins) from tbl t), 'a forfeit win still counts in the record');
-- A real win ranks above a forfeit win on the same record.
select ok(
  (select bool_and(r.rank < f.rank)
   from tbl r, tbl f
   where r.wins = 1 and r.forfeit_wins = 0 and r.losses = 0
     and f.wins = 1 and f.forfeit_wins = 1 and f.losses = 0),
  'a real win ranks above a forfeit win');

-------------------------------------------------------------------------------
-- Who can change it
-------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
select throws_ok($$select public.set_league_pick_rule(pg_temp.lg(), 'whole_card')$$, 'P0001',
  'Only the league''s owner can change its rules.', 'only the owner changes the rule');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select throws_ok($$select public.set_league_pick_rule(pg_temp.casual(), 'whole_card')$$, 'P0001',
  'Only Pro leagues set their own minimum picks.', 'and only in a Pro league');
select throws_ok($$select public.set_league_pick_rule(pg_temp.lg(), 'top_n', 30::smallint)$$, 'P0001',
  'Pick between 2 and 20 fights.', 'top N is 2 to 20');
select lives_ok($$select public.set_league_pick_rule(pg_temp.lg(), 'top_n', 6::smallint)$$, 'the owner sets top 6');
select is((select (scope, top_n)::text from public.my_league_pick_rules() where league_id = pg_temp.lg()),
  '(top_n,6)', 'which members read as the next card''s rule');
reset role;

select * from finish();
rollback;
