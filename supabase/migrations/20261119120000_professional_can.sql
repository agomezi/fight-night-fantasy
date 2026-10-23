-- Professional Can: a season award for finishing last in your league on
-- card after card (at least 2), with Ring Rust shown as the other joke. Each
-- player's stats now count the cards they finished last on.

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
           'last_cards', coalesce((select lc.n from last_on_card lc where lc.scope = t.scope and lc.user_id = t.user_id), 0)
         )
  from totals t;

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
      -- The joke one: far fewer fights a card than everyone else. Lower wins,
      -- so it's ranked on the negative.
      -- Another joke: last in the league on the most cards, at least 2.
      ('pro_can', (s.stats->>'last_cards')::numeric, -(s.stats->>'points')::numeric,
         s.scope <> 'global' and (s.stats->>'last_cards')::numeric >= 2),
      ('gun_shy', -(s.stats->>'picks_per_card')::numeric, -s.picks,
         s.cards >= 2 and (s.stats->>'picks_per_card')::numeric <= md.ppc / 2)
    ) as x(award, value, tiebreak, ok)
  )
  select v.*, rank() over (partition by v.scope, v.award order by v.value desc, v.tiebreak desc) as place
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

  -- Leagues: the table and where it's heading. Projections go over the
  -- weeks each player was in the league (a late joiner's few weeks project
  -- like anyone's), so an odd league's doubleheaders count, over an 11-card
  -- season.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object(
    'rank', t.rank, 'wins', t.wins, 'losses', t.losses, 'draws', t.draws, 'forfeit_wins', t.forfeit_wins,
    'league_points', t.points,
    'projected', case when t.wins + t.losses + t.draws > 0 and w.weeks > 0 then jsonb_build_object(
      'wins', round((t.wins::numeric / (t.wins + t.losses + t.draws)) * ((t.wins + t.losses + t.draws)::numeric / w.weeks) * 11),
      'losses', round((t.losses::numeric / (t.wins + t.losses + t.draws)) * ((t.wins + t.losses + t.draws)::numeric / w.weeks) * 11),
      'draws', round((t.draws::numeric / (t.wins + t.losses + t.draws)) * ((t.wins + t.losses + t.draws)::numeric / w.weeks) * 11),
      'points', round(t.points::numeric / w.weeks * 11)
    ) end
  )
  from public.leagues l
  cross join lateral public.league_table(l.id) t
  cross join lateral (
    select count(distinct s.week) as weeks from public.league_schedule(l.id, d.season_id) s
    where s.state = 'final' and t.user_id in (s.user_a, s.user_b)
  ) w
  where ds.drop_id = d.id and ds.scope = l.id::text and t.user_id = ds.user_id;

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
