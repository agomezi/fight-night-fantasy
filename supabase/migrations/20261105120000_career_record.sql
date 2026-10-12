-- Career: a pro record and a rank on every profile, and league records that
-- outlive the season.
--
-- Pro record: every final card you picked the main event on is a fight.
-- Everyone who did is ranked by main card points, ties split by main event
-- points; the top half win (the middle player of an odd field too) and the
-- rest lose. Players still level on both at the cut line draw. A card needs
-- at least 3 such players to count for anyone.
--
-- Career rank: a point per card fought and another per win.
--
--   Prospect 0 · Contender 5 · Ranked 15 · Title Challenger 35 ·
--   Champion 60 · Legend 150
--
-- League records: a league's matchups are worked out live from today's
-- rotation, which changes when a season opens, so each final week is saved
-- as it is played and past seasons are read from what was saved.
--
-- Both are settled by the results sync after it scores a card, and settled
-- again on every later run, so a correction carries through. A card that is
-- no longer final loses what it had. The pre-season counts while there is
-- one, so it can be tried out, and is wiped when Season 1 opens.

-------------------------------------------------------------------------------
-- When a card is final
-------------------------------------------------------------------------------

-- Over, with a final result for every bout still on it. The same test result
-- notifications use for "the card is final".
create function public.event_is_final(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select e.status = 'complete' and not exists (
    select 1 from public.bouts b
    left join public.results r on r.bout_id = b.id
    where b.event_id = e.id and b.status = 'scheduled' and (r.bout_id is null or r.status <> 'final')
  )
  from public.events e where e.id = event;
$$;

revoke execute on function public.event_is_final(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- What gets kept
-------------------------------------------------------------------------------

-- A card's pro record result for each player who fought it. Kept rather than
-- worked out from scores, because a deleted account's scores go when the
-- next season opens and that would move everyone else's results.
create table public.card_results (
  event_id          uuid not null references public.events (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  points            integer not null,
  main_event_points integer not null,
  field             integer not null,
  result            text not null check (result in ('W', 'L', 'D')),
  saved_at          timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index card_results_user_idx on public.card_results (user_id);

-- A league's finished matchups. No reference to profiles: a purged account's
-- opponents keep their result. A null winner is a draw; a null season is the
-- pre-season.
create table public.league_results (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid references public.seasons (id),
  week      integer not null,
  event_id  uuid not null references public.events (id) on delete cascade,
  user_a    uuid not null,
  user_b    uuid not null,
  points_a  integer not null,
  points_b  integer not null,
  winner    uuid,
  saved_at  timestamptz not null default now(),
  primary key (league_id, event_id, user_a, user_b),
  check (winner is null or winner in (user_a, user_b))
);

create index league_results_user_a_idx on public.league_results (league_id, user_a);
create index league_results_user_b_idx on public.league_results (league_id, user_b);
-- Every sync of a live card clears its results by event.
create index league_results_event_idx on public.league_results (event_id);

-- Read only through the functions below.
alter table public.card_results enable row level security;
alter table public.league_results enable row level security;
revoke all on public.card_results, public.league_results from anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- A league's schedule for any season
-------------------------------------------------------------------------------

-- league_matchups' schedule for `season`, for anyone, without whose matchups
-- are yours. The rotation is today's, so it is right for the current season
-- and, while a new season opens and before anyone is moved, the one before.
create function public.league_schedule(league uuid, season uuid)
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
         end
  from scored s;
end;
$$;

revoke execute on function public.league_schedule(uuid, uuid) from public, anon, authenticated;

-- As before, now the current season's schedule with yours first.
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
begin
  perform public.require_league_member(league);

  return query
  select s.week, s.event_id, s.event_name, s.state,
         s.user_a, s.name_a, s.points_a, s.user_b, s.name_b, s.points_b, s.winner,
         coalesce((select auth.uid()) in (s.user_a, s.user_b), false)
  from public.league_schedule(league, public.current_season()) s
  order by s.week, coalesce((select auth.uid()) in (s.user_a, s.user_b), false) desc, s.user_a;
end;
$$;

-------------------------------------------------------------------------------
-- Settling a card
-------------------------------------------------------------------------------

-- Writes a final card's pro record results afresh.
create function public.settle_card(event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.card_results where event_id = event;

  with main_event as (
    select b.id from public.bouts b
    where b.event_id = event and b.status = 'scheduled'
    order by b.fight_order limit 1
  ),
  fighters as (
    select k.user_id,
           coalesce((
             select sum(s.points) from public.scores s
             join public.bouts b on b.id = s.bout_id
             where s.user_id = k.user_id and b.event_id = event
               and (b.card_segment is null or b.card_segment = 'main')
           ), 0)::integer as points,
           coalesce((
             select s.points from public.scores s where s.user_id = k.user_id and s.bout_id = k.bout_id
           ), 0) as me_points
    from public.picks k
    join public.profiles p on p.id = k.user_id
    where k.bout_id = (select id from main_event)
      -- Deleted and banned accounts don't make up the field.
      and p.deleted_at is null
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'banned'
  ),
  ranked as (
    select f.*,
           count(*) over () as field,
           rank() over (order by f.points desc, f.me_points desc) as place,
           row_number() over (order by f.points desc, f.me_points desc) as pos
    from fighters f
  ),
  cut as (
    -- The top half win: half rounded up, so an odd field's middle player too.
    select (select count(*) from ranked)::integer as n,
           ceil((select count(*) from ranked) / 2.0)::integer as k
  ),
  line as (
    -- The last winner's and first loser's scores; level on both is a draw.
    select (select row(r.points, r.me_points) from ranked r, cut where r.pos = cut.k) as last_in,
           (select row(r.points, r.me_points) from ranked r, cut where r.pos = cut.k + 1) as first_out
  )
  insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
  select event, r.user_id, r.points, r.me_points, r.field,
         case
           when l.last_in = l.first_out and row(r.points, r.me_points) = l.last_in then 'D'
           when r.place <= c.k then 'W'
           else 'L'
         end
  from ranked r, cut c, line l
  where c.n >= 3;
$$;

revoke execute on function public.settle_card(uuid) from public, anon, authenticated;

-- Saves a league's final, two-sided matchups on `event` afresh.
create function public.save_league_week(league uuid, season uuid, event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.league_results where league_id = league and event_id = event;

  insert into public.league_results
    (league_id, season_id, week, event_id, user_a, user_b, points_a, points_b, winner)
  select league, season, s.week, s.event_id, s.user_a, s.user_b, s.points_a, s.points_b, s.winner
  from public.league_schedule(league, season) s
  where s.event_id = event and s.state = 'final' and s.user_b is not null
  on conflict do nothing;
$$;

revoke execute on function public.save_league_week(uuid, uuid, uuid) from public, anon, authenticated;

-- Settles a card's pro records and league results, or clears them when it is
-- no longer final. Called by the results sync after every scoring run.
-- League results are only touched while the card's season is the current
-- one: an older season's rotation is gone, so what was saved then stays. A
-- season's last card that only turns final after the next season opens is
-- missed by its league results for that reason.
create function public.settle_event(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev      public.events%rowtype;
  cur     uuid := public.current_season();
  in_play boolean;
  lg      uuid;
begin
  select * into ev from public.events e where e.id = event;
  if not found then
    return;
  end if;

  -- A pre-season card stops counting once Season 1 has opened.
  in_play := ev.season_id is not distinct from cur;

  if not public.event_is_final(event) or (ev.season_id is null and cur is not null) then
    delete from public.card_results where event_id = event;
    if in_play or ev.season_id is null then
      delete from public.league_results where event_id = event;
    end if;
    return;
  end if;

  perform public.settle_card(event);

  if in_play then
    for lg in
      select m.league_id from public.league_members m
      group by m.league_id
      having count(*) >= (select min_members from public.league_limits())
    loop
      perform public.save_league_week(lg, cur, event);
    end loop;
  end if;
end;
$$;

revoke execute on function public.settle_event(uuid) from public, anon, authenticated;
grant execute on function public.settle_event(uuid) to service_role;

-------------------------------------------------------------------------------
-- When a season opens
-------------------------------------------------------------------------------

-- As before, first keeping what the season ending leaves: every final week of
-- every league while its rotation is still in place, and any final card not
-- yet settled. Season 1 instead wipes the pre-season. Nothing here may stop a
-- season from opening, so a failure is only a warning.
create or replace function public.open_league_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_size integer := (select min_members from public.league_limits());
  ending   uuid;
  lg       uuid;
  ev       uuid;
begin
  begin
    select s.id into ending from public.seasons s
    where s.number = new.number - 1 and s.starts_at is not null;

    if ending is null then
      delete from public.card_results c
      using public.events e
      where e.id = c.event_id and e.season_id is null;
      delete from public.league_results where season_id is null;
    else
      for lg in select l.id from public.leagues l loop
        insert into public.league_results
          (league_id, season_id, week, event_id, user_a, user_b, points_a, points_b, winner)
        select lg, ending, s.week, s.event_id, s.user_a, s.user_b, s.points_a, s.points_b, s.winner
        from public.league_schedule(lg, ending) s
        where s.state = 'final' and s.user_b is not null and public.event_is_final(s.event_id)
        on conflict (league_id, event_id, user_a, user_b) do update
          set week = excluded.week, points_a = excluded.points_a, points_b = excluded.points_b,
              winner = excluded.winner, saved_at = now();
      end loop;

      for ev in
        select e.id from public.events e
        where e.season_id = ending
          and not exists (select 1 from public.card_results c where c.event_id = e.id)
          and public.event_is_final(e.id)
      loop
        perform public.settle_card(ev);
      end loop;
    end if;
  exception when others then
    raise warning 'open_league_season: keeping season results failed: %', sqlerrm;
  end;

  perform public.purge_deleted_accounts();
  delete from public.league_members where left_at is not null;

  with sizes as (
    select league_id, count(*) >= min_size as playing
    from public.league_members group by league_id
  )
  update public.league_members m
     set status = case when s.playing then 'active' else 'queued' end::public.membership_status,
         active_from_season_id = case
           when not s.playing then null
           when m.status = 'active' then m.active_from_season_id
           else new.id
         end
    from sizes s
   where s.league_id = m.league_id;

  return new;
end;
$$;

revoke execute on function public.open_league_season() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Reading it back
-------------------------------------------------------------------------------

-- Your pro record, streak (+ wins or - losses in a row, newest first; 0 after
-- a draw) and career rank.
create function public.my_career()
returns table (
  wins          integer,
  losses        integer,
  draws         integer,
  cards         integer,
  streak        integer,
  career_points integer,
  rank          text,
  next_rank     text,
  next_at       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.result, e.locks_at, e.id
    from public.card_results c
    join public.events e on e.id = c.event_id
    where c.user_id = (select auth.uid())
  ),
  tally as (
    select count(*) filter (where result = 'W')::integer as w,
           count(*) filter (where result = 'L')::integer as l,
           count(*) filter (where result = 'D')::integer as d,
           count(*)::integer as n
    from mine
  ),
  latest as (
    select m.result, row_number() over (order by m.locks_at desc, m.id desc) as i from mine m
  ),
  run as (
    -- How many of the newest results match the newest one.
    select (select result from latest where i = 1) as result,
           coalesce((select min(i) from latest
                     where result is distinct from (select result from latest where i = 1)),
                    (select count(*) + 1 from latest)) - 1 as len
  ),
  ranks (name, at) as (
    values ('Prospect', 0), ('Contender', 5), ('Ranked', 15), ('Title Challenger', 35),
           ('Champion', 60), ('Legend', 150)
  ),
  pts as (
    select t.n + t.w as p from tally t
  )
  select t.w, t.l, t.d, t.n,
         (case r.result when 'W' then r.len when 'L' then -r.len else 0 end)::integer,
         p.p,
         (select k.name from ranks k where k.at <= p.p order by k.at desc limit 1),
         (select k.name from ranks k where k.at > p.p order by k.at limit 1),
         (select k.at from ranks k where k.at > p.p order by k.at limit 1)
  from tally t, run r, pts p;
$$;

revoke execute on function public.my_career() from public, anon;
grant execute on function public.my_career() to authenticated;

-- A player's league record from what was saved: one row per season (null:
-- the pre-season).
create function public.league_record(league uuid, member uuid)
returns table (season_id uuid, wins integer, losses integer, draws integer)
language sql
stable
security definer
set search_path = ''
as $$
  with sides as (
    select r.season_id, r.winner, r.user_b as opp from public.league_results r
    where r.league_id = league and r.user_a = member
    union all
    select r.season_id, r.winner, r.user_a from public.league_results r
    where r.league_id = league and r.user_b = member
  )
  select s.season_id,
         count(*) filter (where s.winner = member)::integer,
         count(*) filter (where s.winner = s.opp)::integer,
         count(*) filter (where s.winner is null)::integer
  from sides s
  group by s.season_id;
$$;

revoke execute on function public.league_record(uuid, uuid) from public, anon, authenticated;

-- Your record in each league you're in: this season (the pre-season before
-- Season 1) and all time.
create function public.my_league_records()
returns table (
  league_id     uuid,
  name          text,
  season_wins   integer,
  season_losses integer,
  season_draws  integer,
  wins          integer,
  losses        integer,
  draws         integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name,
         coalesce(sum(r.wins) filter (where r.season_id is not distinct from public.current_season()), 0)::integer,
         coalesce(sum(r.losses) filter (where r.season_id is not distinct from public.current_season()), 0)::integer,
         coalesce(sum(r.draws) filter (where r.season_id is not distinct from public.current_season()), 0)::integer,
         coalesce(sum(r.wins), 0)::integer,
         coalesce(sum(r.losses), 0)::integer,
         coalesce(sum(r.draws), 0)::integer
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  left join lateral public.league_record(l.id, m.user_id) r on true
  where m.user_id = (select auth.uid()) and m.left_at is null
  group by l.id, l.name, m.joined_at
  order by m.joined_at, l.id;
$$;

revoke execute on function public.my_league_records() from public, anon;
grant execute on function public.my_league_records() to authenticated;

-- A league member's record season by season, newest first, for anyone in
-- the league with them. Season 0 is the pre-season.
create function public.league_record_history(league uuid, member uuid)
returns table (season integer, wins integer, losses integer, draws integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.number, 0), r.wins, r.losses, r.draws
  from public.league_record(league, member) r
  left join public.seasons s on s.id = r.season_id
  where public.shares_league(league, member)
  order by coalesce(s.number, 0) desc;
$$;

revoke execute on function public.league_record_history(uuid, uuid) from public, anon;
grant execute on function public.league_record_history(uuid, uuid) to authenticated;

-------------------------------------------------------------------------------
-- Cards already played
-------------------------------------------------------------------------------

select public.settle_event(e.id)
from public.events e
where e.status = 'complete'
  and e.season_id is not distinct from public.current_season();
