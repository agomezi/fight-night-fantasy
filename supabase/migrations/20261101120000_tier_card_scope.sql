-- Which part of the card each tier plays, and what it must pick.
--
--   Casual    the main card            every bout of it
--   Amateur   main card + last 3       every bout of it
--             prelims
--   Pro and   the whole card           the main event
--   Hardcore
--
-- A league's points, records and matchups count only the bouts its tier
-- plays; picks on the rest still count on the global leaderboard. A member
-- who misses the picks their tier requires on a card loses that week's
-- matchup whatever the score (both missing them is a draw). The "last 3
-- prelims" are the three prelims nearest the main card. A bout with no
-- segment recorded (entered by hand) counts as main card.

create function public.bout_counts_for_tier(tier public.league_tier, bout uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when tier in ('pro', 'hardcore') then true
    when b.card_segment is null or b.card_segment = 'main' then true
    when tier = 'amateur' and b.card_segment = 'prelims' then b.id in (
      select p.id from public.bouts p
      where p.event_id = b.event_id and p.card_segment = 'prelims' and p.status = 'scheduled'
      order by p.fight_order
      limit 3
    )
    else false
  end
  from public.bouts b where b.id = bout;
$$;

-- Whether `player` made the picks `tier` requires on `event`. Cancelled
-- bouts don't count either way.
create function public.met_tier_picks(tier public.league_tier, player uuid, event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with bouts as (
    select b.id, b.fight_order,
           exists (select 1 from public.picks p where p.bout_id = b.id and p.user_id = player) as picked
    from public.bouts b
    where b.event_id = event and b.status = 'scheduled' and public.bout_counts_for_tier(tier, b.id)
  )
  select case
    when not exists (select 1 from bouts) then false
    when tier in ('pro', 'hardcore') then (select bo.picked from bouts bo order by bo.fight_order limit 1)
    else not exists (select 1 from bouts bo where not bo.picked)
  end;
$$;

revoke execute on function public.bout_counts_for_tier(public.league_tier, uuid),
  public.met_tier_picks(public.league_tier, uuid, uuid)
  from public, anon, authenticated;

-- As before, counting only the bouts the league's tier plays.
create or replace function public.league_season_totals(league uuid, season uuid)
returns table (user_id uuid, points integer, correct integer, counted integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t        public.league_tier;
  floored  boolean;
  carries  boolean;
  r        record;
  cur      uuid;
  total    integer;
  debt     integer;
  before   integer;
  pts      integer;
  paid     integer;
begin
  select l.tier into t from public.leagues l where l.id = league;
  floored := t in ('casual', 'amateur');
  carries := t = 'amateur';

  for r in
    select s.user_id as uid,
           case when t = 'casual' then s.casual_points else s.points end as raw,
           s.breakdown, s.correct as hit, s.counts_for_accuracy as counts
    from public.league_members m
    join public.scores s on s.user_id = m.user_id
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where m.league_id = league
      and e.season_id is not distinct from season
      -- Only the part of the card the league's tier plays.
      and public.bout_counts_for_tier(t, b.id)
      -- The pre-season counts from when you joined the league.
      and (season is not null or e.locks_at >= m.joined_at)
    order by s.user_id, e.starts_at, e.id, b.fight_order desc
  loop
    if cur is distinct from r.uid then
      if cur is not null then
        user_id := cur; points := total; return next;
      end if;
      cur := r.uid; total := 0; debt := 0; correct := 0; counted := 0;
    end if;

    before := total;
    pts := r.raw;
    if pts > 0 and debt > 0 then
      paid := least(debt, pts);
      debt := debt - paid;
      pts := pts - paid;
    end if;
    if carries and before = 0 and r.raw < 0
       and (r.breakdown->>'fighter')::integer <= 0
       and (r.breakdown->>'method')::integer <= 0
       and (r.breakdown->>'round')::integer <= 0 then
      debt := 20;
    end if;
    total := case when floored then greatest(0, total + pts) else total + pts end;

    if r.counts then
      counted := counted + 1;
      if r.hit then correct := correct + 1; end if;
    end if;
  end loop;

  if cur is not null then
    user_id := cur; points := total; return next;
  end if;
end;
$$;
revoke execute on function public.league_season_totals(uuid, uuid) from public, anon, authenticated;

-- As before, counting only the bouts the league's tier plays, and a side
-- that missed the tier's required picks loses the week.
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
      -- Only the part of the card the league's tier plays.
      and public.bout_counts_for_tier(t, b.id)
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
           public.met_tier_picks(t, p.ua, p.id) as played_a,
           p.ub is not null and public.met_tier_picks(t, p.ub, p.id) as played_b
    from pairs p
  )
  select s.w, s.id, s.name, s.st,
         s.ua, public.league_display_name(s.ua), case when s.st = 'upcoming' then null else s.pa end,
         s.ub, public.league_display_name(s.ub), case when s.st = 'upcoming' then null else s.pb end,
         case
           when s.st <> 'final' or s.ub is null then null
           -- Missing the picks the tier requires (no picks at all included)
           -- loses, whatever the other side scored; both missing them is a
           -- draw.
           when not s.played_a and not s.played_b then null
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
