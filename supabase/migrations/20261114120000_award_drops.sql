-- Award drops: superlatives handed out at a review of the season so far.
--
-- The owner runs a drop by hand from the SQL editor:
--
--   select * from public.preview_award_drop('Pre-season check-in', 'checkin');  -- who would win; saves nothing
--   select public.run_award_drop('Pre-season check-in', 'checkin');             -- saves it, unpublished
--   select public.publish_award_drop('<id>');                                    -- tells everyone, once
--   select public.delete_award_drop('<id>');                                     -- undoes a drop
--
-- A drop covers the season so far (the pre-season while no season is open):
-- every card that is final. Each league crowns its own winners, and global
-- crowns the P4P #1 by edge. #1 in a league is the Interim Champ at a check-in
-- or mid-season review, and the Champ at a final one.
--
-- What counts: a scored pick that counts for accuracy (so no voids, no picks
-- from before a fighter was replaced), by a player who isn't deleted or
-- banned. In a league, only fights the league's tier plays, on cards the
-- player was a member for, as league_schedule decides. Nobody wins an award
-- on fewer than 8 picks over 2 cards in that league (or globally), except the
-- joke one for picking far fewer fights than everyone else.
--
-- Season 1's launch deletes the pre-season drops along with the rest.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.award_drops (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (char_length(label) between 1 and 60),
  kind         text not null check (kind in ('checkin', 'midseason', 'final')),
  season_id    uuid references public.seasons (id) on delete cascade,
  ran_at       timestamptz not null default now(),
  published_at timestamptz,
  unique nulls not distinct (season_id, label)
);

-- Each player's numbers in each scope: 'global', or a league's id.
create table public.drop_stats (
  drop_id uuid not null references public.award_drops (id) on delete cascade,
  scope   text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stats   jsonb not null,
  primary key (drop_id, scope, user_id)
);

create table public.drop_awards (
  drop_id uuid not null references public.award_drops (id) on delete cascade,
  scope   text not null,
  award   text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value   numeric,
  primary key (drop_id, scope, award, user_id)
);

alter table public.award_drops enable row level security;
alter table public.drop_stats enable row level security;
alter table public.drop_awards enable row level security;
revoke all on public.award_drops, public.drop_stats, public.drop_awards from public, anon, authenticated;

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards'));

-------------------------------------------------------------------------------
-- Working a drop out
-------------------------------------------------------------------------------

-- Fills a drop's stats and awards from the cards final by when it ran.
create function public.compute_award_drop(drop uuid)
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
           'picks_per_card', round(t.picks::numeric / t.cards, 2)
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
    from award_values av where av.scope = ds.scope and av.user_id = ds.user_id and av.award <> 'gun_shy'
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

-------------------------------------------------------------------------------
-- Running, previewing, publishing, undoing
-------------------------------------------------------------------------------

create function public.run_award_drop(label text, kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_drop uuid;
begin
  insert into public.award_drops (label, kind, season_id)
  values (btrim(run_award_drop.label), run_award_drop.kind, public.current_season())
  returning id into new_drop;
  perform public.compute_award_drop(new_drop);
  return new_drop;
end;
$$;

-- Who would win, without saving or telling anyone.
create function public.preview_award_drop(label text, kind text)
returns table (scope_name text, award text, winner text, value numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_drop uuid;
begin
  insert into public.award_drops (label, kind, season_id)
  values ('preview ' || gen_random_uuid(), preview_award_drop.kind, public.current_season())
  returning id into new_drop;
  perform public.compute_award_drop(new_drop);

  return query
  select coalesce(l.name, 'Global'), a.award, p.display_name, round(a.value, 2)
  from public.drop_awards a
  join public.profiles p on p.id = a.user_id
  left join public.leagues l on l.id::text = a.scope
  where a.drop_id = new_drop
  order by a.scope = 'global', l.name, a.award, p.display_name;

  delete from public.award_drops x where x.id = new_drop;
end;
$$;

-- Tells everyone in a league the drop covers, once each, however many
-- leagues they're in. Publishing twice does nothing.
create function public.publish_award_drop(drop uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
  n integer;
begin
  update public.award_drops x set published_at = now()
  where x.id = publish_award_drop.drop and x.published_at is null
  returning * into d;
  if not found then
    return 0;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select distinct ds.user_id, 'awards', d.id::text,
         jsonb_build_object('label', d.label, 'kind', d.kind, 'dropId', d.id),
         false
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope <> 'global'
  on conflict do nothing;
  get diagnostics n = row_count;

  perform public.invoke_activity_push();
  return n;
end;
$$;

create function public.delete_award_drop(drop uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications_sent n where n.kind = 'awards' and n.key = drop::text;
  delete from public.award_drops x where x.id = drop;
$$;

revoke execute on function public.compute_award_drop(uuid), public.run_award_drop(text, text),
  public.preview_award_drop(text, text), public.publish_award_drop(uuid), public.delete_award_drop(uuid)
  from public, anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- Reading a drop
-------------------------------------------------------------------------------

-- The newest published drop this season.
create function public.latest_award_drop()
returns table (id uuid, label text, kind text, ran_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.label, d.kind, d.ran_at
  from public.award_drops d
  where d.published_at is not null and d.season_id is not distinct from public.current_season()
    and (select auth.uid()) is not null
  order by d.ran_at desc limit 1;
$$;

-- A league's drop, for its members: the awards, the table with projections,
-- and your own numbers. Names as you'd see them.
create function public.league_award_drop(league uuid, drop uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
  me uuid := (select auth.uid());
begin
  perform public.require_league_member(league);
  select * into d from public.award_drops x
  where x.published_at is not null
    and (league_award_drop.drop is null or x.id = league_award_drop.drop)
    and x.season_id is not distinct from public.current_season()
  order by x.ran_at desc limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'drop', jsonb_build_object('id', d.id, 'label', d.label, 'kind', d.kind, 'ranAt', d.ran_at),
    'awards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'award', a.award, 'userId', a.user_id, 'name', public.league_display_name(a.user_id), 'value', a.value
      ) order by a.award)
      from public.drop_awards a where a.drop_id = d.id and a.scope = league::text
    ), '[]'::jsonb),
    'p4p', (
      select jsonb_build_object('userId', a.user_id, 'name', public.league_display_name(a.user_id), 'edge', a.value)
      from public.drop_awards a where a.drop_id = d.id and a.scope = 'global' and a.award = 'p4p'
      order by a.user_id limit 1
    ),
    'table', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', s.user_id, 'name', public.league_display_name(s.user_id),
        'rank', s.stats->'rank', 'wins', s.stats->'wins', 'losses', s.stats->'losses', 'draws', s.stats->'draws',
        'points', s.stats->'league_points', 'projected', s.stats->'projected'
      ) order by (s.stats->>'rank')::int nulls last)
      from public.drop_stats s where s.drop_id = d.id and s.scope = league::text
    ), '[]'::jsonb),
    'me', (select s.stats from public.drop_stats s where s.drop_id = d.id and s.scope = league::text and s.user_id = me)
  );
end;
$$;

-- A player's superlatives from the latest drop: awards won globally and in
-- leagues they share with you, and their place in each category there.
-- Nothing for a player you've blocked, or one deleted or banned.
create function public.player_superlatives(member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select x.* from public.award_drops x
    where x.published_at is not null and x.season_id is not distinct from public.current_season()
    order by x.ran_at desc limit 1
  ),
  visible as (
    select 'global'::text as scope, 'Global'::text as name
    union all
    select l.id::text, l.name from public.leagues l where public.shares_league(l.id, member)
  )
  select case when (select auth.uid()) is null
                or public.blocked_by_me(member)
                or exists (select 1 from public.profiles p where p.id = member and p.deleted_at is not null)
                or (select ps.standing from public.player_standing(member) ps) = 'banned'
                or not exists (select 1 from d)
           then null
           else jsonb_build_object(
             'drop', (select jsonb_build_object('id', d.id, 'label', d.label, 'kind', d.kind) from d),
             'awards', coalesce((
               select jsonb_agg(jsonb_build_object('award', a.award, 'scope', vs.name, 'value', a.value) order by a.award)
               from public.drop_awards a join d on d.id = a.drop_id join visible vs on vs.scope = a.scope
               where a.user_id = member
             ), '[]'::jsonb),
             'places', coalesce((
               select jsonb_agg(jsonb_build_object('scope', vs.name, 'places', s.stats->'places'))
               from public.drop_stats s join d on d.id = s.drop_id join visible vs on vs.scope = s.scope
               where s.user_id = member
             ), '[]'::jsonb)
           )
         end;
$$;

revoke execute on function public.latest_award_drop(), public.league_award_drop(uuid, uuid),
  public.player_superlatives(uuid) from public, anon;
grant execute on function public.latest_award_drop(), public.league_award_drop(uuid, uuid),
  public.player_superlatives(uuid) to authenticated;
