-- Fair rotation in odd leagues.
--
-- Until now the player left over by the circle method always played last
-- week's leftover, so in an odd league the same few pairs met again and again
-- (five players over eleven cards: some pairs five times, others twice). Now
-- the leftover plays whoever has played the fewest matchups this season, then
-- whoever they have met the fewest times, then the earliest to join. Even
-- leagues are unchanged.
--
-- That rule depends on earlier weeks, so each week is saved in `league_weeks`
-- when its card locks and never worked out again. Until then the week is
-- worked out live from the weeks before it. Cards that locked before this
-- migration keep the pairings they were played with.

-------------------------------------------------------------------------------
-- Saved weeks
-------------------------------------------------------------------------------

create table public.league_weeks (
  league_id    uuid not null references public.leagues (id) on delete cascade,
  -- Null for the pre-season, which Season 1 wipes.
  season_id    uuid references public.seasons (id),
  event_id     uuid not null references public.events (id) on delete cascade,
  user_a       uuid not null,
  user_b       uuid not null,
  -- The leftover's matchup, which gives `user_b` a second one that week.
  doubleheader boolean not null default false,
  saved_at     timestamptz not null default now(),
  primary key (league_id, event_id, user_a, user_b),
  check (user_a <> user_b)
);

create index league_weeks_event_idx on public.league_weeks (event_id);

alter table public.league_weeks enable row level security;

create policy "read weeks of your leagues" on public.league_weeks
  for select to authenticated using (public.is_league_member(league_id));

-- Written only by `save_league_week_pairings`.
revoke all on public.league_weeks from public, anon, authenticated;
grant select on public.league_weeks to authenticated, service_role;

-- When the new rule took over. A locked card with no saved week from before
-- then keeps the old pairing, so weeks already played never move.
do $do$
begin
  execute format($f$
    create function public.league_rotation_since()
    returns timestamptz
    language sql
    immutable
    set search_path = ''
    as $$ select %L::timestamptz $$
  $f$, now());
end;
$do$;

revoke execute on function public.league_rotation_since() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Working out the weeks
-------------------------------------------------------------------------------

-- Every week of a league's season (null: the pre-season) with its matchups, in
-- order: the saved week where there is one, whoever is in the league now, the
-- old pairing for a card that locked before the rule took over, and otherwise
-- the rule, which counts every week before it. The weeks, cards and rosters are exactly league_schedule's
-- before this migration (20261111).
create function public.league_pairings(league uuid, season uuid)
returns table (
  week          integer,
  card_id       uuid,
  card_name     text,
  card_status   public.event_status,
  card_locks_at timestamptz,
  user_a        uuid,
  user_b        uuid,
  doubleheader  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  min_size integer := (select min_members from public.league_limits());
  since    timestamptz := public.league_rotation_since();
  c        record;
  members  uuid[];
  n        integer;
  wk_a     uuid[];
  wk_b     uuid[];
  wk_d     boolean[];
  -- Every matchup so far this season, in step.
  hist_a   uuid[] := '{}'::uuid[];
  hist_b   uuid[] := '{}'::uuid[];
  hist_d   boolean[] := '{}'::boolean[];
begin
  for c in
    with
    -- A season's weeks are its slots so far plus the next one. The
    -- pre-season's are every card that has locked since the league was made
    -- plus the next.
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
    )
    select * from season_cards
    union all
    select * from preseason_cards
    order by 1
  loop
    wk_a := null;
    if c.id is not null then
      select array_agg(lw.user_a), array_agg(lw.user_b), array_agg(lw.doubleheader)
        into wk_a, wk_b, wk_d
      from public.league_weeks lw where lw.league_id = league and lw.event_id = c.id;
    end if;

    if wk_a is null then
      -- The week's roster in join order: in a season its active members, in the
      -- pre-season whoever was in the league when the card locked.
      members := array(
        select m.user_id from public.league_members m
        where m.league_id = league
          and case
            when season is not null then m.status = 'active'
            else m.joined_at <= coalesce(c.locks_at, now())
                 and (m.left_at is null or m.left_at > coalesce(c.locks_at, now()))
          end
        order by m.joined_at, m.user_id
      );
      n := cardinality(members);
      continue when n < min_size;

      if c.id is not null and c.locks_at <= now() and c.locks_at < since then
        select array_agg(members[p.a + 1]), array_agg(members[p.b + 1]), array_agg(r.b is null)
          into wk_a, wk_b, wk_d
        from public.circle_pairings(n, c.w) p
        join public.circle_round(n, c.w) r on r.a = p.a;

      else
        with r as (
          select cr.a, cr.b from public.circle_round(n, c.w) cr
        ),
        opponent as (
          -- The leftover's opponent: fewest matchups so far, then fewest
          -- meetings with the leftover, then join order. Everyone plays once a
          -- week, so fewest matchups is fewest extra ones; counting those keeps
          -- a pre-season player who joined late from doubling up every week.
          select i - 1 as pos
          from generate_series(1, n) i, (select r.a as lo from r where r.b is null) l
          where i - 1 <> l.lo
          order by
            (select count(*) from unnest(hist_b, hist_d) h(y, d)
              where h.d and h.y = members[i]),
            (select count(*) from unnest(hist_a, hist_b) h(x, y)
              where (h.x, h.y) in ((members[i], members[l.lo + 1]), (members[l.lo + 1], members[i]))),
            i
          limit 1
        )
        select array_agg(members[r.a + 1]),
               array_agg(members[coalesce(r.b, (select o.pos from opponent o)) + 1]),
               array_agg(r.b is null)
          into wk_a, wk_b, wk_d
        from r;
      end if;
    end if;

    return query
    select c.w, c.id, c.name, c.status, c.locks_at, x.a, x.b, x.d
    from unnest(wk_a, wk_b, wk_d) x(a, b, d);

    hist_a := hist_a || wk_a;
    hist_b := hist_b || wk_b;
    hist_d := hist_d || wk_d;
  end loop;
end;
$$;

revoke execute on function public.league_pairings(uuid, uuid) from public, anon, authenticated;

-- The season a card's week belongs to: its slot's, or the pre-season (null)
-- while no season has started. `known` is false for an unslotted card once
-- one has: it is either the season's next slot or a pre-season card nobody
-- plays any more.
create function public.league_card_season(event uuid, out season uuid, out known boolean)
language sql
stable
set search_path = ''
as $$
  select e.season_id, e.season_id is not null or public.current_season() is null
  from public.events e where e.id = event;
$$;

revoke execute on function public.league_card_season(uuid) from public, anon, authenticated;

-- One league's matchups on one card, from the history saved so far. Nothing
-- for a card outside the league's current schedule.
create function public.next_pairings(league uuid, event uuid)
returns table (user_a uuid, user_b uuid, doubleheader boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s record;
begin
  select * into s from public.league_card_season(event);
  if not coalesce(s.known, false) then
    -- An unslotted card in a season is the season's next slot.
    s.season := public.current_season();
  end if;

  return query
  select p.user_a, p.user_b, p.doubleheader
  from public.league_pairings(league, s.season) p
  where p.card_id = event;
end;
$$;

revoke execute on function public.next_pairings(uuid, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Saving a week when its card locks
-------------------------------------------------------------------------------

-- Saves every league's matchups on a locked card. Running it again changes
-- nothing. Returns how many rows it saved.
create function public.save_league_week_pairings(event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev    public.events%rowtype;
  s     record;
  saved integer := 0;
  added integer;
  lg    uuid;
begin
  -- Two cards saving at once would each miss the other's week.
  perform pg_advisory_xact_lock(hashtext('public.save_league_week_pairings'));

  select * into ev from public.events e where e.id = event;
  if not found or ev.status = 'cancelled' or ev.locks_at > now() then
    return 0;
  end if;

  -- A card that has just locked takes its season slot first, so its week is
  -- the one the schedule showed as upcoming.
  if ev.season_id is null then
    perform public.assign_season_slots();
  end if;

  select * into s from public.league_card_season(event);
  if not s.known then
    return 0;
  end if;

  for lg in select l.id from public.leagues l loop
    insert into public.league_weeks (league_id, season_id, event_id, user_a, user_b, doubleheader)
    select lg, s.season, event, p.user_a, p.user_b, p.doubleheader
    from public.league_pairings(lg, s.season) p
    where p.card_id = event
    on conflict do nothing;
    get diagnostics added = row_count;
    saved := saved + added;
  end loop;

  return saved;
end;
$$;

revoke execute on function public.save_league_week_pairings(uuid) from public, anon, authenticated;

-- Every card that has locked in the last two days and isn't saved yet, in
-- lock order. A card no league plays is looked at again, which is cheap.
create function public.save_locked_league_weeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev    uuid;
  saved integer := 0;
begin
  for ev in
    select e.id from public.events e
    where e.status <> 'cancelled'
      and e.locks_at <= now()
      and e.locks_at > now() - interval '2 days'
      and e.locks_at >= public.league_rotation_since()
      and not exists (select 1 from public.league_weeks lw where lw.event_id = e.id)
    order by e.locks_at, e.id
  loop
    begin
      saved := saved + public.save_league_week_pairings(ev);
    exception when others then
      raise warning 'save_locked_league_weeks: %: %', ev, sqlerrm;
    end;
  end loop;
  return saved;
end;
$$;

revoke execute on function public.save_locked_league_weeks() from public, anon, authenticated;

select cron.schedule('league-weeks', '* * * * *', $$select public.save_locked_league_weeks()$$);

-- Season 1 wipes the pre-season's weeks with the rest of it.
create function public.clear_preseason_weeks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.seasons s
    where s.number = new.number - 1 and s.starts_at is not null
  ) then
    delete from public.league_weeks where season_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_preseason_weeks() from public, anon, authenticated;

create trigger seasons_clear_preseason_weeks after insert on public.seasons
  for each row when (new.starts_at is not null)
  execute function public.clear_preseason_weeks();

create trigger seasons_clear_preseason_weeks_on_start after update of starts_at on public.seasons
  for each row when (old.starts_at is null and new.starts_at is not null)
  execute function public.clear_preseason_weeks();

-------------------------------------------------------------------------------
-- The schedule, from the saved weeks
-------------------------------------------------------------------------------

-- As before (20261111), with the matchups from league_pairings. Same columns.
create or replace function public.league_schedule(league uuid, season uuid)
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
  winner      uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.league_tier;
begin
  select l.tier into t from public.leagues l where l.id = league;

  return query
  with
  pairs as (
    select p.week as w, p.card_id as id, p.card_name as name, p.card_status as status,
           p.card_locks_at as locks_at, p.user_a as ua, p.user_b as ub
    from public.league_pairings(league, season) p
  ),
  card_points as (
    select b.event_id, s.user_id,
           sum(case when t = 'casual' then s.casual_points else s.points end)::integer as pts,
           bool_or(s.provisional) as provisional
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    where b.event_id in (select p.id from pairs p where p.id is not null)
      -- Only the part of the card the league's tier plays.
      and public.bout_counts_for_tier(t, b.id)
    group by b.event_id, s.user_id
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
           public.met_league_picks(league, p.ua, p.id) as played_a,
           p.ub is not null and public.met_league_picks(league, p.ub, p.id) as played_b
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
         end
  from scored s;
end;
$$;

revoke execute on function public.league_schedule(uuid, uuid) from public, anon, authenticated;
