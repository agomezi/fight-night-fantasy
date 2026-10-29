-- Title fights: the field after card 8, the play-in, semifinals and title
-- fight on cards 9 to 11 (ties to the better seed), the belt replayed from
-- the results (defenses, a loss leaves it vacant, a forfeit win isn't a
-- defense), the Champion kept out of an odd league's extra matchup, title
-- pushes, the inbox for older builds, and who can read what.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000c1' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.lg(code text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000' || code)::uuid
$$;
create function pg_temp.ev(code text) returns uuid language sql as $$
  select id from public.events where ufc_event_id = 'tf-' || code
$$;
create function pg_temp.sn(n int) returns uuid language sql as $$
  select id from public.seasons where number = n
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.league(code text, members int[]) returns void language sql as $$
  insert into public.leagues (id, name, owner_id, tier, created_at)
  values (pg_temp.lg(code), 'League ' || code, pg_temp.u(members[1]), 'pro', now() - interval '200 days');
  insert into public.league_members (league_id, user_id, joined_at)
  select pg_temp.lg(code), pg_temp.u(m), now() - interval '200 days' + i * interval '1 minute'
  from unnest(members) with ordinality x(m, i);
  -- In the season from its start.
  update public.league_members set status = 'active' where league_id = pg_temp.lg(code);
$$;
-- A week's matchups as "a-b" member numbers, smaller first, with the round.
create function pg_temp.week(league uuid, season uuid, wk int) returns text language sql as $$
  select string_agg(x.p, ',' order by x.p)
  from (
    select least(right(p.user_a::text, 2), right(p.user_b::text, 2)) || '-'
           || greatest(right(p.user_a::text, 2), right(p.user_b::text, 2))
           || coalesce(':' || p.stage, '') || case when p.doubleheader then '+' else '' end as p
    from public.league_pairings(league, season) p where p.week = wk
  ) x;
$$;
create function pg_temp.result(code text, season int, wk int, a int, b int, w int) returns void language sql as $$
  insert into public.league_results (league_id, season_id, week, event_id, user_a, user_b, points_a, points_b, winner)
  values (pg_temp.lg(code), pg_temp.sn(season), wk, pg_temp.ev(season || '-' || wk), pg_temp.u(a), pg_temp.u(b),
          10, 10, case when w is null then null else pg_temp.u(w) end);
$$;
-- Sets a saved result's winner, either way round.
create function pg_temp.win(code text, season int, wk int, a int, b int, w int) returns void language sql as $$
  update public.league_results set winner = case when w is null then null else pg_temp.u(w) end
  where league_id = pg_temp.lg(code) and event_id = pg_temp.ev(season || '-' || wk)
    and (user_a, user_b) in ((pg_temp.u(a), pg_temp.u(b)), (pg_temp.u(b), pg_temp.u(a)));
$$;
create function pg_temp.lock(code text) returns void language sql as $$
  update public.events set locks_at = now() - interval '1 hour', starts_at = now() - interval '1 hour'
  where ufc_event_id = 'tf-' || code;
$$;

-- The table and the picks are tested elsewhere; here the table is the join
-- order, and everyone made their picks.
create or replace function public.league_table(league uuid)
returns table (
  rank bigint, user_id uuid, display_name text, status text, wins integer, losses integer, draws integer,
  points integer, correct integer, counted integer, is_me boolean, is_owner boolean, season_label text,
  forfeit_wins integer
)
language sql stable set search_path = '' as $$
  select row_number() over (order by m.joined_at), m.user_id, 'x', 'active', 0, 0, 0, 0, 0, 0, false, false, 'S', 0
  from public.league_members m where m.league_id = league and m.status = 'active' order by m.joined_at
$$;
create or replace function public.met_league_picks(league uuid, player uuid, event uuid)
returns boolean language sql stable set search_path = '' as $$
  select player <> ('00000000-0000-0000-0000-00000000c1' || '99')::uuid
$$;
create or replace function public.league_rotation_since() returns timestamptz
  language sql immutable set search_path = '' as $$ select '-infinity'::timestamptz $$;

delete from public.events;

insert into auth.users (id, email)
select pg_temp.u(n), 'tf' || n || '@example.test'
from (select generate_series(1, 6) union all select generate_series(11, 15) union all select 99) g(n);

-- Season 1: eight cards played, three to come.
insert into public.seasons (number, starts_at) values (1, now() - interval '100 days');
insert into public.events (ufc_event_id, name, starts_at, locks_at, status, season_id, season_index)
select 'tf-1-' || i, 'Card ' || i,
       case when i <= 8 then now() - interval '80 days' + i * interval '7 days' else now() + i * interval '7 days' end,
       case when i <= 8 then now() - interval '80 days' + i * interval '7 days' else now() + i * interval '7 days' end,
       case when i <= 8 then 'complete' else 'scheduled' end::public.event_status,
       pg_temp.sn(1), i
from generate_series(1, 11) i;

select pg_temp.league('00b6', array[1, 2, 3, 4, 5, 6]);
select pg_temp.league('00b5', array[11, 12, 13, 14, 15]);

select is(array[public.title_field_size(6), public.title_field_size(12), public.title_field_size(5),
                public.title_field_size(4), public.title_field_size(3)],
          array[5, 5, 4, 4, 0], 'five make the field from six players, four in a league of four or five');

-------------------------------------------------------------------------------
-- The field and the play-in
-------------------------------------------------------------------------------

select is((select array_agg(right(s.user_id::text, 2) order by s.seed) from public.league_season_seeds(pg_temp.lg('00b6'), pg_temp.sn(1)) s),
          array['01', '02', '03', '04', '05'], 'until card 9 locks the field is the table''s top five');
select is((select count(*)::int from public.league_season_seeds(pg_temp.lg('00b5'), pg_temp.sn(1))), 4,
          'and the top four in a league of five');

select is(pg_temp.week(pg_temp.lg('00b6'), pg_temp.sn(1), 9), '01-02,03-06,04-05:play_in',
          'card 9: #4 vs #5 in the play-in, everyone else paired among themselves');
select is(pg_temp.week(pg_temp.lg('00b6'), pg_temp.sn(1), 8) is not null, true, 'card 8 is a normal week');
select is((select count(*)::int from public.league_pairings(pg_temp.lg('00b5'), pg_temp.sn(1)) p
           where p.week = 9 and p.stage is not null), 0,
          'a league of five has no play-in');

select pg_temp.lock('1-9');
update public.events set status = 'live' where ufc_event_id = 'tf-1-8';
select throws_ok($$select public.save_league_week_pairings(pg_temp.ev('1-9'))$$, null, null,
  'card 9 isn''t saved while card 8 isn''t final, so the field is the table after card 8');
update public.events set status = 'complete' where ufc_event_id = 'tf-1-8';
select ok(public.save_league_week_pairings(pg_temp.ev('1-9')) > 0, 'card 9 saves once it is');
select is((select count(*)::int from public.league_seeds where league_id = pg_temp.lg('00b6')), 5,
          'and saves the field with it');
select is((select stage from public.league_weeks
           where league_id = pg_temp.lg('00b6') and event_id = pg_temp.ev('1-9') and pg_temp.u(4) in (user_a, user_b)),
          'play_in', 'with the play-in saved as one');

-- The seeds hold whatever the table does after.
update public.league_seeds set user_id = pg_temp.u(99) where league_id = pg_temp.lg('00b6') and seed = 5;
select is((select right(s.user_id::text, 2) from public.league_season_seeds(pg_temp.lg('00b6'), pg_temp.sn(1)) s where s.seed = 5),
          '99', 'saved seeds are read back as saved');
update public.league_seeds set user_id = pg_temp.u(5) where league_id = pg_temp.lg('00b6') and seed = 5;
create temp table b6_seeds as select * from public.league_seeds where league_id = pg_temp.lg('00b6');
delete from public.league_seeds where league_id = pg_temp.lg('00b6');
select is((select count(*)::int from public.league_season_seeds(pg_temp.lg('00b6'), pg_temp.sn(1))), 0,
          'a league whose card 9 was saved without a field gets none later');
insert into public.league_seeds select * from b6_seeds;

-------------------------------------------------------------------------------
-- Semifinals and the title fight
-------------------------------------------------------------------------------

-- #5 wins the play-in.
select pg_temp.result('00b6', 1, 9, 4, 5, 5);
select is(pg_temp.week(pg_temp.lg('00b6'), pg_temp.sn(1), 10), '01-05:semi,02-03:semi,04-06',
          'card 10: #1 vs the play-in winner, #2 vs #3');

select pg_temp.lock('1-10');
update public.events set status = 'complete' where ufc_event_id = 'tf-1-9';
select ok(public.save_league_week_pairings(pg_temp.ev('1-10')) > 0, 'card 10 saves');
-- While card 10 isn't final, nobody has gone through on a draw of zero
-- points: the better seeds lead.
select is(right(public.bracket_advance(pg_temp.lg('00b6'), pg_temp.sn(1), 'semi', pg_temp.u(2), pg_temp.u(3))::text, 2),
          '02', 'a level semifinal still being played has the better seed through');
-- #1 and #5 draw: the better seed goes through. #3 beats #2.
select pg_temp.result('00b6', 1, 10, 1, 5, null);
select pg_temp.result('00b6', 1, 10, 2, 3, 3);
select is(pg_temp.week(pg_temp.lg('00b6'), pg_temp.sn(1), 11), '01-03:title,02-06,04-05',
          'card 11: the title fight between the winners, a draw going to the better seed');

select is((select holder from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(1), 10)), null,
          'the title is vacant in Season 1 until the title fight');

select pg_temp.lock('1-11');
update public.events set status = 'complete' where ufc_event_id = 'tf-1-10';
select ok(public.save_league_week_pairings(pg_temp.ev('1-11')) > 0, 'card 11 saves');
select pg_temp.result('00b6', 1, 11, 1, 3, 3);
select is((select right(holder::text, 2) || '/' || defenses from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(1), 11)),
          '03/0', 'the title fight''s winner is the Champion, whatever the seed');

-- A rescore that flips it moves the belt.
update public.league_results set winner = pg_temp.u(1)
where league_id = pg_temp.lg('00b6') and event_id = pg_temp.ev('1-11') and user_a = pg_temp.u(1);
select is((select right(holder::text, 2) from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(1), 11)),
          '01', 'a rescore that flips the title fight moves the belt');
update public.league_results set winner = null
where league_id = pg_temp.lg('00b6') and event_id = pg_temp.ev('1-11') and user_a = pg_temp.u(1);
select is((select right(holder::text, 2) from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(1), 11)),
          '01', 'a drawn title fight goes to the better seed');
update public.league_results set winner = pg_temp.u(3)
where league_id = pg_temp.lg('00b6') and event_id = pg_temp.ev('1-11') and user_a = pg_temp.u(1);

-------------------------------------------------------------------------------
-- Pushes
-------------------------------------------------------------------------------

update public.events set status = 'complete' where ufc_event_id like 'tf-1-%';
create temp table pushed as
  select * from public.claim_title_notifications(pg_temp.ev('1-11'));
select is((select payload->>'type' from pushed where user_id = pg_temp.u(3)), 'champion',
          'the new Champion hears it');
select is((select count(*)::int from public.claim_title_notifications(pg_temp.ev('1-11'))), 0,
          'once');
select is((select payload->>'type' from public.claim_title_notifications(pg_temp.ev('1-9')) where user_id = pg_temp.u(5)),
          'advanced', 'the play-in winner hears they''re through');

-------------------------------------------------------------------------------
-- Season 2: defenses, a forfeit, a loss
-------------------------------------------------------------------------------

insert into public.seasons (number, starts_at) values (2, now() - interval '1 day');
insert into public.events (ufc_event_id, name, starts_at, locks_at, status, season_id, season_index)
select 'tf-2-' || i, 'Card ' || i, now() - (6 - i) * interval '1 hour', now() - (6 - i) * interval '1 hour', 'complete', pg_temp.sn(2), i
from generate_series(1, 5) i;
insert into public.events (ufc_event_id, name, starts_at, locks_at, status)
values ('tf-2-6', 'Card 6', now() + interval '30 minutes', now() + interval '30 minutes', 'scheduled');
-- Opening a season settles the last one's cards again from their scores,
-- which these tests don't have: put the results back.
select pg_temp.win('00b6', 1, 9, 4, 5, 5), pg_temp.win('00b6', 1, 10, 1, 5, null),
       pg_temp.win('00b6', 1, 10, 2, 3, 3), pg_temp.win('00b6', 1, 11, 1, 3, 3);

select is((select right(holder::text, 2) from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 0)),
          '03', 'the Champion carries the belt into the next season');
select pg_temp.result('00b6', 2, 1, 3, 1, 3);
select pg_temp.result('00b6', 2, 1, 3, 6, 3);
select is((select defenses from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 1)), 1,
          'a win is a defense, once a card in a doubleheader');
select pg_temp.result('00b6', 2, 2, 3, 2, null);
select is((select right(holder::text, 2) || '/' || defenses from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 2)),
          '03/1', 'a draw keeps the belt, with no defense');
-- Player 99 never makes their picks.
insert into public.league_members (league_id, user_id, joined_at) values (pg_temp.lg('00b6'), pg_temp.u(99), now());
update public.league_members set status = 'active' where user_id = pg_temp.u(99);
select pg_temp.result('00b6', 2, 3, 3, 99, 3);
select is((select defenses from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 3)), 1,
          'a forfeit win keeps the belt without a defense');
select pg_temp.result('00b6', 2, 4, 4, 3, 4);
select is((select holder from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 4)), null,
          'a loss leaves the title vacant; the winner doesn''t take it');
select pg_temp.result('00b6', 2, 5, 4, 1, 4);
select is((select holder from public.league_title_state(pg_temp.lg('00b6'), pg_temp.sn(2), 5)), null,
          'and it stays vacant');

-------------------------------------------------------------------------------
-- An odd league: the Champion skips the extra matchup
-------------------------------------------------------------------------------

-- Player 11 won league b5's title fight.
select pg_temp.win('00b5', 1, 11, 11, (select right(case when user_a = pg_temp.u(11) then user_b else user_a end::text, 2)::int
                                       from public.league_weeks where league_id = pg_temp.lg('00b5')
                                         and event_id = pg_temp.ev('1-11') and stage = 'title'), 11);
select is((select right(holder::text, 2) from public.league_title_state(pg_temp.lg('00b5'), pg_temp.sn(2), 0)), '11',
          'league b5''s Champion');

select is((select count(*)::int from public.league_pairings(pg_temp.lg('00b5'), pg_temp.sn(2)) p
           where p.doubleheader and p.user_b = pg_temp.u(11)), 0,
          'in an odd league the Champion never plays the extra matchup');

create temp table reminded as select * from public.claim_title_reminders();
select is((select payload->>'stage' from reminded where user_id = pg_temp.u(11)), 'defense',
          'within the hour before the next, unslotted card, the Champion hears they defend');
select is((select count(*)::int from reminded r join public.league_pairings(pg_temp.lg('00b5'), pg_temp.sn(2)) p
           on p.card_id = pg_temp.ev('2-6') and r.user_id in (p.user_a, p.user_b) and pg_temp.u(11) in (p.user_a, p.user_b)), 2,
          'and so does their opponent');
select is((select count(*)::int from public.claim_title_reminders()), 0, 'once');

-- A Champion outside next season's field gives the title up going into card 9.
insert into public.league_seeds (league_id, season_id, seed, user_id)
select pg_temp.lg('00b5'), pg_temp.sn(2), i, pg_temp.u(11 + i) from generate_series(1, 4) i;
select is((select right(holder::text, 2) from public.league_title_state(pg_temp.lg('00b5'), pg_temp.sn(2), 7)), '11',
          'a Champion outside the field holds the belt until the field is set');
select is((select holder from public.league_title_state(pg_temp.lg('00b5'), pg_temp.sn(2), 8)), null,
          'and gives it up going into card 9');
delete from public.league_seeds where league_id = pg_temp.lg('00b5') and season_id = pg_temp.sn(2);

-------------------------------------------------------------------------------
-- Who reads what
-------------------------------------------------------------------------------

update public.events set status = 'live' where ufc_event_id = 'tf-2-4';
select is((select payload->>'type' from public.claim_title_notifications(pg_temp.ev('2-4')) where user_id = pg_temp.u(3)),
          null, 'nothing is sent for a card that isn''t final');
update public.events set status = 'complete' where ufc_event_id = 'tf-2-4';
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(4), pg_temp.u(3));
select is((select count(*)::int from public.claim_title_notifications(pg_temp.ev('2-4'))
           where user_id in (pg_temp.u(3), pg_temp.u(4))), 0,
          'nothing about a player you blocked, or who blocked you');
delete from public.player_blocks where blocker = pg_temp.u(4);
create temp table vacated as select * from public.claim_title_notifications(pg_temp.ev('2-4'));
select is((select payload->>'type' from vacated where user_id = pg_temp.u(3)),
          'lost_title', 'the Champion hears the title is vacant');
select is((select payload->>'type' from vacated where user_id = pg_temp.u(4)),
          'beat_champ', 'and whoever beat them');

set local role authenticated;
select pg_temp.act(2);
select is((public.league_title(pg_temp.lg('00b6'))->'champion'), 'null'::jsonb,
          'a member reads the title: vacant');
select is((public.league_title(pg_temp.lg('00b6'))->>'seedsFinal')::boolean, false,
          'with Season 2''s field projected, not set');
select is((select count(*)::int from public.league_seeds where league_id = pg_temp.lg('00b6')), 5,
          'a member reads their league''s seeds');
select is((select count(*)::int from public.league_seeds where league_id = pg_temp.lg('00b5')), 0,
          'and not another league''s');
select throws_ok($$select public.league_title(pg_temp.lg('00b5'))$$, null, null,
  'a player outside the league can''t read its title');
select throws_ok($$select * from public.claim_title_notifications(pg_temp.ev('1-11'))$$, '42501', null,
  'a player can''t claim title pushes');

select pg_temp.act(3);
select is((select count(*)::int from public.inbox_items_v5() where kind = 'title'), 2, 'the new inbox shows title news');
select is((select count(*)::int from public.inbox_items_v4() where kind = 'title'), 0, 'older builds'' inbox doesn''t');
select is(public.inbox_unread_count_v4() < public.inbox_unread_count_v5(), true, 'nor counts it');

select * from finish();
rollback;
