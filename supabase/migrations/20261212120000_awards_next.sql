-- Awards next: The Oracle and Iron Chin, and a league's table read from the
-- weeks as they were saved.
--
-- The Oracle: the best hit rate on settled hot takes from the drop's cards,
-- on at least 5 of them, more takes breaking a tie. Global, and in a league
-- over the cards the player was a member for. A take the owner voided, or one
-- called off with its fight, doesn't count.
--
-- A league's table, Champ and Interim Champ come from league_results, the
-- matchups saved as each card went final, rather than from today's schedule.
-- The schedule is worked out from today's members, so someone leaving or a
-- purged account would otherwise reshuffle weeks already played. Ranked as
-- the standings are: 3 a win, half that for a forfeit win, 1 a draw, over the
-- matchups played, then points (each card once, so a doubleheader isn't
-- counted twice; no Casual or Amateur floor), then accuracy, then head to
-- head. Only players still in the league are ranked. A final card whose
-- weeks haven't been saved yet is settled first.
--
-- Iron Chin: the longest run of league matchups without a loss this season,
-- at least 3. A card with a win and a loss on it counts the win first.

create or replace function public.compute_award_drop(drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
  champ text;
begin
  select * into d from public.award_drops x where x.id = compute_award_drop.drop;
  champ := case when d.kind = 'final' then 'champ' else 'interim_champ' end;

  delete from public.drop_awards a where a.drop_id = d.id;
  delete from public.drop_stats s where s.drop_id = d.id;

  -- A results sync that failed to save a card's weeks would leave it out of
  -- the table. settle_event is safe to run again.
  perform public.settle_event(e.id)
  from public.events e
  where e.season_id is not distinct from d.season_id
    and e.locks_at <= d.ran_at
    and public.event_is_final(e.id)
    and not exists (select 1 from public.league_results r where r.event_id = e.id);

  -- Stats, per player per scope.
  insert into public.drop_stats (drop_id, scope, user_id, stats)
  with cards as (
    select e.id, e.locks_at from public.events e
    where e.season_id is not distinct from d.season_id
      and e.locks_at <= d.ran_at
      and public.event_is_final(e.id)
  ),
  base as (
    select k.user_id, b.event_id, c.locks_at, b.id as bout_id,
           k.finish = 'round' or k.method is not null as finish_call,
           k.finish = 'DEC' as dec_call,
           k.finish = 'round' as round_call,
           b.underdog_corner is not null as has_dog,
           b.underdog_corner is not null
             and (case when k.picked_fighter_id = b.red_fighter_id then 'red' else 'blue' end) = b.underdog_corner::text
             as dog_pick,
           s.correct, s.points,
           -- Called with the right fighter: a wrong fighter still earns a
           -- little for the method, which isn't calling how it ends.
           s.correct and coalesce((s.breakdown->>'method')::int, 0) > 0 as method_right,
           coalesce((s.breakdown->>'round')::int, 0) > 0 as round_right
    from public.picks k
    join public.bouts b on b.id = k.bout_id and k.bout_version = b.version and b.status = 'scheduled'
    join cards c on c.id = b.event_id
    join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id and s.counts_for_accuracy
    join public.profiles p on p.id = k.user_id
    where p.deleted_at is null
      and (select ps.standing from public.player_standing(k.user_id) ps) is distinct from 'banned'
  ),
  scoped as (
    select 'global'::text as scope, b.* from base b
    union all
    select l.id::text, b.*
    from base b
    join public.league_members m on m.user_id = b.user_id
    join public.leagues l on l.id = m.league_id
    where m.joined_at <= b.locks_at
      and (m.left_at is null or m.left_at > b.locks_at)
      and public.bout_counts_for_tier(l.tier, b.bout_id)
  ),
  per_card as (
    select scope, user_id, event_id, count(*) as n, bool_and(correct) as clean
    from scoped group by scope, user_id, event_id
  ),
  -- Where each player finished on each card in a league: last on a card
  -- of 3 or more, ties included.
  card_points as (
    select s.scope, s.user_id, s.event_id, sum(s.points) as pts
    from scoped s where s.scope <> 'global'
    group by s.scope, s.user_id, s.event_id
  ),
  last_on_card as (
    select z.scope, z.user_id, count(*) as n
    from (
      select c.*, count(*) over (partition by c.scope, c.event_id) as field,
             min(c.pts) over (partition by c.scope, c.event_id) as low
      from card_points c
    ) z
    where z.field >= 3 and z.pts = z.low
    group by z.scope, z.user_id
  ),
  -- Settled takes on the drop's cards, by the same players.
  settled_polls as materialized (
    select cp.id, c.locks_at, o.outcome
    from public.community_polls cp
    join cards c on c.id = cp.event_id
    cross join lateral (select public.poll_outcome(cp.id) as outcome) o
    where o.outcome is not null and o.outcome <> 'void'
  ),
  takes as (
    select v.user_id, sp.locks_at, v.option = sp.outcome as right_call
    from settled_polls sp
    join public.poll_votes v on v.poll_id = sp.id
    join public.profiles p on p.id = v.user_id
    where p.deleted_at is null
      and (select ps.standing from public.player_standing(v.user_id) ps) is distinct from 'banned'
  ),
  takes_scoped as (
    select 'global'::text as scope, t.user_id, t.right_call from takes t
    union all
    select m.league_id::text, t.user_id, t.right_call
    from takes t
    join public.league_members m on m.user_id = t.user_id
    where m.joined_at <= t.locks_at
      and (m.left_at is null or m.left_at > t.locks_at)
  ),
  takes_totals as (
    select t.scope, t.user_id, count(*) as n, count(*) filter (where t.right_call) as right_calls
    from takes_scoped t group by t.scope, t.user_id
  ),
  totals as (
    select s.scope, s.user_id,
           count(*) as picks,
           count(distinct s.event_id) as cards,
           count(*) filter (where s.correct) as hits,
           count(*) filter (where s.finish_call) as finish_calls,
           count(*) filter (where s.dec_call) as dec_calls,
           count(*) filter (where s.has_dog) as dog_fights,
           count(*) filter (where s.has_dog and not s.dog_pick) as fav_picks,
           count(*) filter (where s.dog_pick and s.correct) as dog_hits,
           count(*) filter (where s.round_call) as round_calls,
           count(*) filter (where s.round_right) as rounds_right,
           count(*) filter (where s.method_right) as methods_right,
           max(s.points) as best_call,
           sum(s.points) as points
    from scoped s group by s.scope, s.user_id
  )
  select d.id, t.scope, t.user_id,
         jsonb_build_object(
           'picks', t.picks, 'cards', t.cards, 'hits', t.hits,
           'finish_calls', t.finish_calls, 'dec_calls', t.dec_calls,
           'dog_fights', t.dog_fights, 'fav_picks', t.fav_picks, 'dog_hits', t.dog_hits,
           'round_calls', t.round_calls, 'rounds_right', t.rounds_right, 'methods_right', t.methods_right,
           'best_call', t.best_call, 'points', t.points,
           'perfect_cards', (select count(*) from per_card pc
                             where pc.scope = t.scope and pc.user_id = t.user_id and pc.n >= 5 and pc.clean),
           'picks_per_card', round(t.picks::numeric / t.cards, 2),
           'last_cards', coalesce((select lc.n from last_on_card lc where lc.scope = t.scope and lc.user_id = t.user_id), 0),
           'takes', coalesce(tt.n, 0),
           'takes_right', coalesce(tt.right_calls, 0)
         )
  from totals t
  left join takes_totals tt on tt.scope = t.scope and tt.user_id = t.user_id;

  -- Each league's saved matchups this season, from each side. Working tables
  -- for this call, like award_values below.
  drop table if exists pg_temp.stored_games;
  create temp table stored_games on commit drop as
  select r.league_id, r.event_id, e.locks_at, x.uid, x.opp, x.pts,
         case when r.winner = x.uid then 'W' when r.winner = x.opp then 'L' else 'D' end as outcome,
         r.winner = x.uid and not public.met_league_picks(r.league_id, x.opp, r.event_id) as forfeit
  from public.league_results r
  join public.events e on e.id = r.event_id
  cross join lateral (values (r.user_a, r.user_b, r.points_a), (r.user_b, r.user_a, r.points_b)) as x(uid, opp, pts)
  where r.season_id is not distinct from d.season_id
    and e.locks_at <= d.ran_at;

  drop table if exists pg_temp.stored_table;
  create temp table stored_table on commit drop as
  with rec as (
    select g.league_id, g.uid,
           count(*) filter (where g.outcome = 'W')::integer as wins,
           count(*) filter (where g.forfeit)::integer as forfeit_wins,
           count(*) filter (where g.outcome = 'L')::integer as losses,
           count(*) filter (where g.outcome = 'D')::integer as draws,
           count(distinct g.event_id)::integer as weeks
    from stored_games g group by g.league_id, g.uid
  ),
  -- A doubleheader saves the card's points on both matchups; count them once.
  card_pts as (
    select c.league_id, c.uid, sum(c.pts)::integer as points
    from (select distinct g.league_id, g.uid, g.event_id, g.pts from stored_games g) c
    group by c.league_id, c.uid
  ),
  -- The longest stretch between losses, a card's wins and draws before its loss.
  runs as (
    select g.league_id, g.uid, g.outcome,
           count(*) filter (where g.outcome = 'L') over (
             partition by g.league_id, g.uid
             order by g.locks_at, g.event_id, g.outcome = 'L', g.opp
             rows unbounded preceding
           ) as breaks
    from stored_games g
  ),
  unbeaten as (
    select z.league_id, z.uid, max(z.n)::integer as best
    from (
      select r.league_id, r.uid, r.breaks, count(*) filter (where r.outcome <> 'L') as n
      from runs r group by r.league_id, r.uid, r.breaks
    ) z
    group by z.league_id, z.uid
  ),
  keyed as (
    select rc.*, cp.points, coalesce(u.best, 0) as unbeaten_run,
           (3 * (rc.wins - rc.forfeit_wins) + 1.5 * rc.forfeit_wins + rc.draws)::numeric
             / (rc.wins + rc.losses + rc.draws) as pct,
           coalesce((ds.stats->>'hits')::numeric / nullif((ds.stats->>'picks')::numeric, 0), 0) as acc,
           ds.user_id is not null
             and exists (select 1 from public.league_members m
                         where m.league_id = rc.league_id and m.user_id = rc.uid and m.left_at is null
                           and (d.season_id is null or m.status = 'active')) as ranked
    from rec rc
    join card_pts cp on cp.league_id = rc.league_id and cp.uid = rc.uid
    left join unbeaten u on u.league_id = rc.league_id and u.uid = rc.uid
    left join public.drop_stats ds
      on ds.drop_id = d.id and ds.scope = rc.league_id::text and ds.user_id = rc.uid
  ),
  -- Head to head: net wins over the ranked players level on everything else.
  h2h as (
    select k.*,
           case when k.ranked then (
             select coalesce(sum(case g.outcome when 'W' then 1 when 'L' then -1 else 0 end), 0)
             from stored_games g
             join keyed o on o.league_id = g.league_id and o.uid = g.opp
             where g.league_id = k.league_id and g.uid = k.uid and o.ranked
               and o.pct = k.pct and o.points = k.points and o.acc = k.acc
           ) else 0 end as h2h
    from keyed k
  )
  select k.*,
         case when k.ranked then rank() over (
           partition by k.league_id, k.ranked order by k.pct desc, k.points desc, k.acc desc, k.h2h desc
         ) end as rank
  from h2h k;

  -- Leagues: the table and where it's heading. Projections go over the
  -- weeks each player played (a late joiner's few weeks project like
  -- anyone's), so an odd league's doubleheaders count, over an 11-card
  -- season.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object(
    'rank', t.rank, 'wins', t.wins, 'losses', t.losses, 'draws', t.draws, 'forfeit_wins', t.forfeit_wins,
    'league_points', t.points, 'unbeaten_run', t.unbeaten_run,
    'projected', case when t.weeks > 0 then jsonb_build_object(
      'wins', round(t.wins::numeric / t.weeks * 11),
      'losses', round(t.losses::numeric / t.weeks * 11),
      'draws', round(t.draws::numeric / t.weeks * 11),
      'points', round(t.points::numeric / t.weeks * 11)
    ) end
  )
  from stored_table t
  where ds.drop_id = d.id and ds.scope = t.league_id::text and ds.user_id = t.uid;

  -- Each award's value per player, where they qualify. A working table for
  -- this call; a preview just before a run leaves one behind.
  drop table if exists pg_temp.award_values;
  create temp table award_values on commit drop as
  with s as (
    select ds.scope, ds.user_id, ds.stats,
           (ds.stats->>'picks')::numeric as picks, (ds.stats->>'cards')::numeric as cards
    from public.drop_stats ds where ds.drop_id = d.id
  ),
  medians as (
    select s.scope, percentile_cont(0.5) within group (order by (s.stats->>'picks_per_card')::numeric) as ppc
    from s group by s.scope
  ),
  v as (
    select s.scope, s.user_id, x.award, x.value, x.tiebreak,
           x.ok and (x.award = 'gun_shy' or (s.picks >= 8 and s.cards >= 2)) as ok
    from s
    join medians md on md.scope = s.scope
    cross join lateral (values
      ('finisher', (s.stats->>'finish_calls')::numeric / s.picks, (s.stats->>'finish_calls')::numeric, true),
      ('judge', (s.stats->>'dec_calls')::numeric / s.picks, (s.stats->>'dec_calls')::numeric, true),
      ('chalk', (s.stats->>'fav_picks')::numeric / nullif((s.stats->>'dog_fights')::numeric, 0),
         (s.stats->>'fav_picks')::numeric, (s.stats->>'dog_fights')::numeric >= 4),
      ('dog', (s.stats->>'dog_hits')::numeric, (s.stats->>'dog_hits')::numeric / nullif((s.stats->>'dog_fights')::numeric, 0),
         (s.stats->>'dog_hits')::numeric >= 1),
      ('sniper', (s.stats->>'rounds_right')::numeric / nullif((s.stats->>'round_calls')::numeric, 0),
         (s.stats->>'rounds_right')::numeric, (s.stats->>'round_calls')::numeric >= 3 and (s.stats->>'rounds_right')::numeric >= 1),
      ('ice_cold', (s.stats->>'perfect_cards')::numeric, s.picks, (s.stats->>'perfect_cards')::numeric >= 1),
      ('sharpshooter', (s.stats->>'hits')::numeric / s.picks, (s.stats->>'hits')::numeric, true),
      ('method_man', (s.stats->>'methods_right')::numeric, s.picks, (s.stats->>'methods_right')::numeric >= 1),
      ('iron_man', s.picks, s.cards, true),
      ('call_of_night', (s.stats->>'best_call')::numeric, s.picks, (s.stats->>'best_call')::numeric > 0),
      ('oracle', (s.stats->>'takes_right')::numeric / nullif((s.stats->>'takes')::numeric, 0),
         (s.stats->>'takes')::numeric, (s.stats->>'takes')::numeric >= 5),
      ('iron_chin', (s.stats->>'unbeaten_run')::numeric, (s.stats->>'wins')::numeric,
         s.scope <> 'global' and (s.stats->>'unbeaten_run')::numeric >= 3),
      -- The joke one: far fewer fights a card than everyone else. Lower wins,
      -- so it's ranked on the negative.
      -- Another joke: last in the league on the most cards, at least 2.
      ('pro_can', (s.stats->>'last_cards')::numeric, -(s.stats->>'points')::numeric,
         s.scope <> 'global' and (s.stats->>'last_cards')::numeric >= 2),
      ('gun_shy', -(s.stats->>'picks_per_card')::numeric, -s.picks,
         s.cards >= 2 and (s.stats->>'picks_per_card')::numeric <= md.ppc / 2)
    ) as x(award, value, tiebreak, ok)
  )
  select v.*, rank() over (partition by v.scope, v.award order by v.value desc, v.tiebreak desc nulls last) as place
  from v where v.ok and v.value is not null;

  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, av.scope, av.award, av.user_id,
         case when av.award = 'gun_shy' then -av.value else av.value end
  from award_values av where av.place = 1;

  -- Each player's place in every category, for their profile.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object('places', (
    select coalesce(jsonb_object_agg(av.award, av.place), '{}'::jsonb)
    from award_values av where av.scope = ds.scope and av.user_id = ds.user_id and av.award not in ('gun_shy', 'pro_can')
  ))
  where ds.drop_id = d.id;

  -- League #1: Interim Champ at a review, Champ at a final one.
  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, ds.scope, champ, ds.user_id, null
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope <> 'global' and (ds.stats->>'rank')::int = 1;

  -- Global: P4P by edge, rankable players only.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object('p4p_rank', lb.rank, 'edge', lb.edge)
  from public.season_leaderboard(100000) lb
  where ds.drop_id = d.id and ds.scope = 'global' and lb.user_id = ds.user_id and lb.rank is not null;

  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, 'global', 'p4p', ds.user_id, (ds.stats->>'edge')::numeric
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope = 'global' and (ds.stats->>'p4p_rank')::int = 1;
end;
$$;

revoke execute on function public.compute_award_drop(uuid) from public, anon, authenticated, service_role;
