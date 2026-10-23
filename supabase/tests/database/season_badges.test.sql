-- Season badges: only a real season's final drop locks awards in, a league's
-- name shows only to its members, and half-season drops stay off profiles.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'sb' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = 'Badger' || v.n from generate_series(1, 3) v(n) where p.id = pg_temp.u(v.n);

-- Season 1, a league with players 1 and 2 (3 is outside it).
insert into public.seasons (id, number) values ('00000000-0000-0000-0000-0000000000f1', 901);
insert into public.leagues (id, name, owner_id) values ('00000000-0000-0000-0000-0000000000aa', 'Crew', pg_temp.u(1));
insert into public.league_members (league_id, user_id, status)
select '00000000-0000-0000-0000-0000000000aa', pg_temp.u(n), 'active' from generate_series(1, 2) n;

-- A drop with the same awards for each kind: a mid-season one, a pre-season
-- final, and the season's final.
create function pg_temp.drop_with_awards(kind text, season uuid) returns uuid language plpgsql as $$
declare
  id uuid;
begin
  insert into public.award_drops (label, kind, season_id) values (kind || coalesce(season::text, 'pre'), kind, season)
  returning award_drops.id into id;
  insert into public.drop_awards (drop_id, scope, award, user_id, value) values
    (id, '00000000-0000-0000-0000-0000000000aa', 'champ', pg_temp.u(1), null),
    (id, '00000000-0000-0000-0000-0000000000aa', 'dog', pg_temp.u(1), 4),
    (id, 'global', 'p4p', pg_temp.u(1), 120);
  return id;
end;
$$;

select public.publish_award_drop(pg_temp.drop_with_awards('midseason', '00000000-0000-0000-0000-0000000000f1'));
select public.publish_award_drop(pg_temp.drop_with_awards('final', null));
select is((select count(*)::int from public.award_badges), 0, 'half-season and pre-season drops give no badges');

create temp table final_drop as select pg_temp.drop_with_awards('final', '00000000-0000-0000-0000-0000000000f1') as id;
select is((select count(*)::int from public.award_badges), 0, 'a final drop locks nothing in until it''s published');
select public.publish_award_drop((select id from final_drop));
select is((select count(*)::int from public.award_badges where user_id = pg_temp.u(1)), 3, 'publishing a season''s final drop does');

-- A rename later doesn't rewrite the badge.
update public.leagues set name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000aa';

set local role authenticated;
select pg_temp.act(2);
select is(public.player_badges(pg_temp.u(1)),
  '[{"award": "p4p", "scope": "Global", "value": 120, "season": 901},
    {"award": "champ", "scope": "Crew", "value": null, "season": 901},
    {"award": "dog", "scope": "Crew", "value": 4, "season": 901}]'::jsonb,
  'a league-mate sees every badge with the league''s name as it was');
select pg_temp.act(3);
select is((public.player_badges(pg_temp.u(1)))->1->>'scope', 'League', 'someone outside the league doesn''t see its name');
select is(public.player_superlatives(pg_temp.u(1)), null, 'profiles no longer show the latest drop');
select throws_ok($$select * from public.award_badges$$, '42501', null, 'badges are only read through player_badges');

reset role;
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(3), pg_temp.u(1));
set local role authenticated;
select pg_temp.act(3);
select is(public.player_badges(pg_temp.u(1)), '[]'::jsonb, 'nothing for a player you''ve blocked');

reset role;
select public.delete_award_drop((select id from final_drop));
select is((select count(*)::int from public.award_badges), 0, 'deleting the final drop takes its badges back');

select * from finish();
rollback;
