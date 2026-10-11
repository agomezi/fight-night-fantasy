-- Sitting out a card loses the matchup.
--
-- In a Pro league totals go negative, so a player with no picks (0) beat an
-- opponent who played and went negative (2026-10-10: 0 beat -93). Now a side
-- with no scored pick on the card loses that week's matchup whatever the
-- other side scored, and if neither side picked it's a draw.

create or replace function public.league_matchups(league uuid)
returns table (
  week        integer,
  event_id    uuid,
  event_name  text,
  state       text,
  user_a      uuid,
  name_a      text,
  points_a    integer,
  user_b      uuid,
  name_b      text,
  points_b    integer,
  winner      uuid,
  is_mine     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season uuid := public.current_season();
  t      public.league_tier;
begin
  perform public.require_league_member(league);
  select l.tier into t from public.leagues l where l.id = league;

  return query
  with
  -- A season's weeks are its slots so far plus the next one, every week
  -- played by the active members. The pre-season's are every card that has
  -- locked since the league was made plus the next, each played by whoever
  -- was in the league when it locked.
  next_card as (
    select e.id, e.name, e.status, e.locks_at from public.events e
    where e.season_id is null and e.status <> 'cancelled' and e.locks_at > now()
    order by e.locks_at limit 1
  ),
  season_cards as (
    select wk.w,
           coalesce(e.id, nc.id) as id, coalesce(e.name, nc.name) as name,
           coalesce(e.status, nc.status) as status, coalesce(e.locks_at, nc.locks_at) as locks_at
    from generate_series(1, least(
           (select coalesce(max(x.season_index), 0)::integer from public.events x where x.season_id = season) + 1,
           11)) wk(w)
    left join public.events e on e.season_id = season and e.season_index = wk.w
    left join next_card nc on e.id is null
    where season is not null
  ),
  preseason_played as (
    select e.id, e.name, e.status, e.locks_at
    from public.events e
    where season is null
      and e.season_id is null and e.status <> 'cancelled'
      and e.locks_at <= now()
      and e.locks_at >= (select l.created_at from public.leagues l where l.id = league)
  ),
  preseason_cards as (
    select (row_number() over (order by p.locks_at, p.id))::integer as w, p.id, p.name, p.status, p.locks_at
    from preseason_played p
    union all
    select (select count(*) from preseason_played)::integer + 1, nc.id, nc.name, nc.status, nc.locks_at
    from next_card nc
    where season is null
  ),
  cards as (
    select * from season_cards
    union all
    select * from preseason_cards
  ),
  roster as (
    select c.w, m.user_id,
           (row_number() over (partition by c.w order by m.joined_at, m.user_id) - 1)::integer as pos
    from cards c
    join public.league_members m on m.league_id = league
    where case
      when season is not null then m.status = 'active'
      else m.joined_at <= coalesce(c.locks_at, now())
           and (m.left_at is null or m.left_at > coalesce(c.locks_at, now()))
    end
  ),
  sizes as (
    select r.w, count(*)::integer as size from roster r group by r.w
  ),
  card_points as (
    select b.event_id, s.user_id,
           sum(case when t = 'casual' then s.casual_points else s.points end)::integer as pts,
           bool_or(s.provisional) as provisional
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    where b.event_id in (select c.id from cards c where c.id is not null)
    group by b.event_id, s.user_id
  ),
  pairs as (
    select c.w, c.id, c.name, c.status, c.locks_at, ma.user_id as ua, mb.user_id as ub
    from cards c
    join sizes n on n.w = c.w
    cross join lateral public.circle_pairings(n.size, c.w) p
    join roster ma on ma.w = c.w and ma.pos = p.a
    left join roster mb on mb.w = c.w and mb.pos = p.b
    where n.size >= (select min_members from public.league_limits())
  ),
  scored as (
    select p.*,
           case
             when p.id is null or p.locks_at > now() then 'upcoming'
             when p.status = 'complete'
                  and not exists (
                    select 1 from card_points cp where cp.event_id = p.id and cp.provisional
                  ) then 'final'
             else 'live'
           end as st,
           coalesce((select cp.pts from card_points cp where cp.event_id = p.id and cp.user_id = p.ua), 0) as pa,
           case when p.ub is null then null
                else coalesce((select cp.pts from card_points cp where cp.event_id = p.id and cp.user_id = p.ub), 0)
           end as pb,
           exists (select 1 from card_points cp where cp.event_id = p.id and cp.user_id = p.ua) as played_a,
           exists (select 1 from card_points cp where cp.event_id = p.id and cp.user_id = p.ub) as played_b
    from pairs p
  )
  select s.w, s.id, s.name, s.st,
         s.ua, public.league_display_name(s.ua), case when s.st = 'upcoming' then null else s.pa end,
         s.ub, public.league_display_name(s.ub), case when s.st = 'upcoming' then null else s.pb end,
         case
           when s.st <> 'final' or s.ub is null then null
           -- No picks on the card loses, whatever the other side scored;
           -- neither side picking is a draw.
           when s.played_a and not s.played_b then s.ua
           when s.played_b and not s.played_a then s.ub
           when s.pa = s.pb then null
           when s.pa > s.pb then s.ua
           else s.ub
         end,
         coalesce((select auth.uid()) in (s.ua, s.ub), false)
  from scored s
  order by s.w, coalesce((select auth.uid()) in (s.ua, s.ub), false) desc, s.ua;
end;
$$;
