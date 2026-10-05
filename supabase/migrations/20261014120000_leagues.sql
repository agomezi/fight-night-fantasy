-- Leagues: creating and joining by invite code, the weekly head-to-head
-- schedule, matchups and standings.
--
-- Membership locks at the season boundary. Anyone who joins is queued, and
-- queued members become active when the next season opens, provided the league
-- has the minimum four. Leaving mid-season keeps you in the rotation until the
-- season ends, so nobody else's schedule or record changes under them.
--
-- The schedule is not stored. Each week's pairings come from the circle method
-- over the active members in join order, so they are a pure function of
-- (members, week) and cannot drift. A week is an event's season slot.
--
-- Until Season 1 opens at launch, leagues play a pre-season: the same weekly
-- head-to-heads and table over every card since the league was made, with each
-- week's pairings drawn from whoever was in the league when that card locked.
-- It is practice; everything starts clean when Season 1 opens.
--
-- Standings rank on record, a win worth 3, a draw 1 and a loss 0, per matchup
-- played (an odd league's doubleheaders even out), then season points, then
-- accuracy, then the head-to-head result when exactly two players are level.
-- Anyone still level shares a rank, and nobody is ranked before the first
-- card of the season has been played. Points are the league's tier: Casual
-- uses its own per-bout points, and Casual and Amateur replay the season with
-- the floor (and Amateur's debt), as scoring's settleSeason does.

-------------------------------------------------------------------------------
-- Membership
-------------------------------------------------------------------------------

-- Set when an active member leaves or is removed. They stay in this season's
-- rotation and leave at the next season boundary.
alter table public.league_members add column left_at timestamptz;

-- True when the caller is in the league, including someone who has left but
-- is still in this season's rotation. Runs as its owner so the policy below
-- does not recurse into itself.
create function public.is_league_member(league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = league and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_league_member(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;

create policy "read memberships in your leagues" on public.league_members
  for select to authenticated using (public.is_league_member(league_id));

-- Leagues are only ever changed through the functions below.
revoke insert, update, delete on public.leagues, public.league_members from authenticated;

-- Whoever has been in the league longest takes over a league `uid` owns,
-- preferring active members, never someone who has left or deleted their
-- account. A league with no one to take it is deleted.
create function public.hand_over_leagues(uid uuid, only_league uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leagues l
     set owner_id = (
       select m.user_id
         from public.league_members m
         join public.profiles p on p.id = m.user_id
        where m.league_id = l.id
          and m.user_id <> uid
          and m.left_at is null
          and p.deleted_at is null
        order by (m.status = 'active') desc, m.joined_at, m.user_id
        limit 1
     )
   where l.owner_id = uid
     and (only_league is null or l.id = only_league)
     and exists (
       select 1
         from public.league_members m
         join public.profiles p on p.id = m.user_id
        where m.league_id = l.id
          and m.user_id <> uid
          and m.left_at is null
          and p.deleted_at is null
     );

  delete from public.leagues
   where owner_id = uid and (only_league is null or id = only_league);
end;
$$;

revoke execute on function public.hand_over_leagues(uuid, uuid) from public, anon, authenticated;

-- As before, with ownership passing through hand_over_leagues so someone who
-- has left is never handed a league.
create or replace function public.tombstone_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = null, deleted_at = now()
   where id = old.id;

  -- Picks on a card that has not locked yet never counted for anything.
  delete from public.picks p
   using public.bouts b, public.events e
   where p.user_id = old.id
     and b.id = p.bout_id
     and e.id = b.event_id
     and e.locks_at > now();

  -- A queued membership has not joined any standings yet.
  delete from public.league_members
   where user_id = old.id and status = 'queued';

  perform public.hand_over_leagues(old.id);

  return old;
end;
$$;

-- The player has to be signed in, not deleted, and named: standings show
-- names, so a nameless player could not appear in them.
create function public.require_named_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = uid and deleted_at is null and display_name is not null
  ) then
    raise exception 'Pick a display name first.' using errcode = 'P0001', hint = 'needs_name';
  end if;
  return uid;
end;
$$;

revoke execute on function public.require_named_player() from public, anon, authenticated;

-- How many leagues one player can be in at once, and how big a league gets.
create function public.league_limits()
returns table (max_leagues integer, min_members integer, max_members integer)
language sql
immutable
set search_path = ''
as $$
  select 10, 4, 12;
$$;

grant execute on function public.league_limits() to authenticated;

create function public.check_league_capacity(uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.league_members where user_id = uid and left_at is null)
     >= (select max_leagues from public.league_limits()) then
    raise exception 'You''re in as many leagues as you can be.' using errcode = 'P0001', hint = 'too_many_leagues';
  end if;
end;
$$;

revoke execute on function public.check_league_capacity(uuid) from public, anon, authenticated;

-- Starts a league with the caller as owner and its first (queued) member.
create function public.create_league(name text, tier public.league_tier default 'casual')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := public.require_named_player();
  clean  text := btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
  league uuid;
begin
  if tier = 'hardcore' then
    raise exception 'Hardcore leagues aren''t open yet.' using errcode = 'P0001', hint = 'tier_unavailable';
  end if;
  if char_length(clean) not between 1 and 40 then
    raise exception 'League names are 1 to 40 characters.' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- The display-name list, read word by word as it reads a handle.
  if public.display_name_blocked(replace(clean, ' ', '_')) then
    raise exception 'That name isn''t allowed.' using errcode = 'P0001', hint = 'blocked';
  end if;
  perform public.check_league_capacity(uid);

  insert into public.leagues (name, owner_id, tier) values (clean, uid, tier)
  returning id into league;
  insert into public.league_members (league_id, user_id) values (league, uid);
  return league;
end;
$$;

-- Joins by invite code, queued for the next season. Joining a league you are
-- already in does nothing; rejoining one you left this season puts you back.
create function public.join_league(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := public.require_named_player();
  league uuid;
  mine   public.league_members%rowtype;
  known  boolean;
begin
  select id into league from public.leagues
  where invite_code = lower(btrim(coalesce(code, '')));
  if not found then
    raise exception 'No league has that code.' using errcode = 'P0001', hint = 'not_found';
  end if;

  select * into mine from public.league_members where league_id = league and user_id = uid;
  known := found;
  if known and mine.left_at is null then
    return league;
  end if;

  perform public.check_league_capacity(uid);
  if (select count(*) from public.league_members where league_id = league and left_at is null)
     >= (select max_members from public.league_limits()) then
    raise exception 'That league is full.' using errcode = 'P0001', hint = 'full';
  end if;

  if known then
    update public.league_members set left_at = null where league_id = league and user_id = uid;
  else
    insert into public.league_members (league_id, user_id) values (league, uid);
  end if;
  return league;
end;
$$;

-- Takes `member` out of `league`. During a season queued members go at once
-- and active ones stay in the rotation until it ends. In the pre-season
-- everyone has played, so the row stays to keep the weeks they were in.
create function public.drop_league_member(league uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_season() is not null then
    delete from public.league_members
     where league_id = league and user_id = member and status = 'queued';
  end if;
  update public.league_members set left_at = coalesce(left_at, now())
   where league_id = league and user_id = member;

  if (select owner_id from public.leagues where id = league) = member then
    perform public.hand_over_leagues(member, league);
  end if;
end;
$$;

revoke execute on function public.drop_league_member(uuid, uuid) from public, anon, authenticated;

create function public.leave_league(league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.league_members
    where league_id = league and user_id = uid and left_at is null
  ) then
    raise exception 'You''re not in that league.' using errcode = 'P0001', hint = 'not_member';
  end if;
  perform public.drop_league_member(league, uid);
end;
$$;

-- The owner removing someone else, on the same terms as leaving.
create function public.remove_league_member(league uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select owner_id from public.leagues where id = league) is distinct from auth.uid() then
    raise exception 'Only the league owner can do that.' using errcode = 'P0001', hint = 'not_owner';
  end if;
  if member = auth.uid() then
    raise exception 'Leave the league instead.' using errcode = 'P0001', hint = 'self';
  end if;
  if not exists (
    select 1 from public.league_members
    where league_id = league and user_id = member and left_at is null
  ) then
    raise exception 'They''re not in this league.' using errcode = 'P0001', hint = 'not_member';
  end if;
  perform public.drop_league_member(league, member);
end;
$$;

revoke execute on function public.create_league(text, public.league_tier),
  public.join_league(text), public.leave_league(uuid), public.remove_league_member(uuid, uuid)
  from public, anon;
grant execute on function public.create_league(text, public.league_tier),
  public.join_league(text), public.leave_league(uuid), public.remove_league_member(uuid, uuid)
  to authenticated;

-------------------------------------------------------------------------------
-- The season boundary
-------------------------------------------------------------------------------

-- When a season opens: deleted accounts are purged, members who left go, and
-- every league with at least the minimum activates its queue. A league below
-- the minimum plays unranked until a season opens with enough members.
create function public.open_league_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_size integer := (select min_members from public.league_limits());
begin
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

create trigger seasons_open_leagues after insert on public.seasons
  for each row when (new.starts_at is not null)
  execute function public.open_league_season();

-- Season 1 may be created first and given its start later.
create trigger seasons_open_leagues_on_start after update of starts_at on public.seasons
  for each row when (old.starts_at is null and new.starts_at is not null)
  execute function public.open_league_season();

-------------------------------------------------------------------------------
-- The schedule
-------------------------------------------------------------------------------

-- One round of the circle method: player 0 stays put and the rest rotate one
-- place a week, so everyone meets everyone once per cycle and the cycle then
-- repeats in the same order. With n odd a phantom player n is added; whoever
-- draws it is left over (`b` null). Players are 0-based positions in join order.
create function public.circle_round(n integer, week integer)
returns table (a integer, b integer)
language sql
immutable
set search_path = ''
as $$
  with shape as (
    select n + n % 2 as size, (week - 1) % (n + n % 2 - 1) as turn
    where n >= 2 and week >= 1
  ),
  seats as (
    select s.size, i as seat,
           case when i = 0 then 0 else 1 + (i - 1 + s.turn) % (s.size - 1) end as player
    from shape s, generate_series(0, s.size - 1) i
  )
  select case when x.player >= n then y.player else x.player end,
         case when x.player >= n or y.player >= n then null else y.player end
  from seats x
  join seats y on y.seat = x.size - 1 - x.seat
  where x.seat < x.size / 2;
$$;

-- Week `week`'s matchups. Nobody sits out: in an odd league the player left
-- over plays a doubleheader opponent, last week's leftover, who plays twice
-- that week. Everyone is left over once and doubles up once per cycle, so
-- everyone plays the same number of matchups.
create function public.circle_pairings(n integer, week integer)
returns table (a integer, b integer)
language sql
immutable
set search_path = ''
as $$
  with prev as (
    -- An odd cycle is n weeks long, so the week before week 1 is week n.
    select r.a as p
    from public.circle_round(n, case when week = 1 then n else week - 1 end) r
    where r.b is null
  )
  select r.a, coalesce(r.b, (select p from prev))
  from public.circle_round(n, week) r;
$$;

grant execute on function public.circle_round(integer, integer), public.circle_pairings(integer, integer)
  to authenticated;

-- The season whose standings are current: the latest one that has started,
-- or none during the pre-season.
create function public.current_season()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.seasons where starts_at is not null order by number desc limit 1;
$$;

-------------------------------------------------------------------------------
-- Points at the league's tier
-------------------------------------------------------------------------------

-- Each member's season total at the league's tier, with accuracy. Replays the
-- season in the order the bouts were fought (the main event, order 1, last),
-- applying the floor and Amateur's debt exactly as settleSeason does.
create function public.league_season_totals(league uuid, season uuid)
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

-------------------------------------------------------------------------------
-- Matchups
-------------------------------------------------------------------------------

create function public.require_league_member(league uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_league_member(league) then
    raise exception 'You''re not in that league.' using errcode = 'P0001', hint = 'not_member';
  end if;
end;
$$;

revoke execute on function public.require_league_member(uuid) from public, anon, authenticated;

-- Every week of the current season (or the pre-season) so far, plus the next
-- one: who plays whom, the card, each side's points on it at the league's
-- tier, and whether it is upcoming, live or final. A matchup's points are the
-- card's raw total; the floor and debt apply to the season total, not to a
-- single card. Weeks with fewer than four players have no matchups.
create function public.league_matchups(league uuid)
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
           end as pb
    from pairs p
  )
  select s.w, s.id, s.name, s.st,
         s.ua, public.league_display_name(s.ua), case when s.st = 'upcoming' then null else s.pa end,
         s.ub, public.league_display_name(s.ub), case when s.st = 'upcoming' then null else s.pb end,
         case
           when s.st <> 'final' or s.ub is null or s.pa = s.pb then null
           when s.pa > s.pb then s.ua
           else s.ub
         end,
         coalesce((select auth.uid()) in (s.ua, s.ub), false)
  from scored s
  order by s.w, coalesce((select auth.uid()) in (s.ua, s.ub), false) desc, s.ua;
end;
$$;

-- A member's name as the league shows it.
create function public.league_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when uid is null then null
    when p.deleted_at is not null then 'Former Member'
    else coalesce(p.display_name, 'Player')
  end
  from public.profiles p where p.id = uid;
$$;

revoke execute on function public.league_display_name(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Standings
-------------------------------------------------------------------------------

-- The league table. Members in the rotation are ranked on record, then
-- points, then accuracy, then head-to-head between exactly two level players;
-- queued members are listed with their points but no rank, marked as joining
-- next season. Nobody has a rank until the first card has been played, or in
-- a league too small to play.
create function public.league_standings(league uuid)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  status        text,
  wins          integer,
  losses        integer,
  draws         integer,
  points        integer,
  correct       integer,
  counted       integer,
  is_me         boolean,
  is_owner      boolean,
  season_label  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season uuid := public.current_season();
begin
  perform public.require_league_member(league);

  return query
  with schedule as materialized (
    select mu.user_a, mu.user_b, mu.winner, mu.state from public.league_matchups(league) mu
  ),
  finals as (
    select sc.user_a, sc.user_b, sc.winner from schedule sc
    where sc.state = 'final' and sc.user_b is not null
  ),
  outcomes as (
    select f.user_a as uid, f.user_b as opp, f.winner from finals f
    union all
    select f.user_b, f.user_a, f.winner from finals f
  ),
  tally as (
    select o.uid,
           count(*) filter (where o.winner = o.uid)::integer as w,
           count(*) filter (where o.winner = o.opp)::integer as l,
           count(*) filter (where o.winner is null)::integer as d
    from outcomes o group by o.uid
  ),
  totals as (
    select * from public.league_season_totals(league, season)
  ),
  listed as (
    select m.user_id as uid,
           case
             when m.left_at is not null then 'left'
             when p.deleted_at is not null then 'former'
             when season is null then 'active'
             else m.status::text
           end as st,
           case when season is null then m.left_at is null else m.status = 'active' end
             and exists (select 1 from schedule sc where sc.state <> 'upcoming') as ranked,
           coalesce(rc.w, 0) as w, coalesce(rc.l, 0) as l, coalesce(rc.d, 0) as d,
           coalesce(t.points, 0) as pts,
           coalesce(t.correct, 0) as hit,
           coalesce(t.counted, 0) as cnt
    from public.league_members m
    join public.profiles p on p.id = m.user_id
    left join tally rc on rc.uid = m.user_id
    left join totals t on t.user_id = m.user_id
    where m.league_id = league
      -- Someone who left during the pre-season is not coming back for the
      -- rest of it; their old matchups still count for their opponents.
      and not (season is null and m.left_at is not null)
  ),
  keyed as (
    select r.*,
           case when r.w + r.l + r.d = 0 then 0
                else (3 * r.w + r.d)::numeric / (r.w + r.l + r.d) end as pct,
           case when r.cnt = 0 then 0 else r.hit::numeric / r.cnt end as acc
    from listed r
  ),
  grouped as (
    select k.*, count(*) over (partition by k.ranked, k.pct, k.pts, k.acc) as level
    from keyed k
  ),
  h2h as (
    select g.*,
           case when g.ranked and g.level = 2 then (
             select coalesce(sum(case when rs.winner = g.uid then 1 when rs.winner = rs.opp then -1 else 0 end), 0)
             from outcomes rs
             join grouped o on o.uid = rs.opp
             where rs.uid = g.uid and o.ranked and o.level = 2
               and o.pct = g.pct and o.pts = g.pts and o.acc = g.acc
           ) else 0 end as h2h
    from grouped g
  )
  select case when h.ranked then rank() over (
           partition by h.ranked order by h.pct desc, h.pts desc, h.acc desc, h.h2h desc
         ) end,
         h.uid, public.league_display_name(h.uid), h.st,
         h.w, h.l, h.d, h.pts, h.hit, h.cnt,
         h.uid = (select auth.uid()),
         h.uid = (select l.owner_id from public.leagues l where l.id = league),
         coalesce((select 'SEASON ' || s.number from public.seasons s where s.id = season), 'PRE-SEASON')
  from h2h h
  order by h.ranked desc, h.pct desc, h.pts desc, h.acc desc, h.h2h desc, h.st, public.league_display_name(h.uid);
end;
$$;

-- The caller's leagues, for the Leagues tab: enough to list them and say how
-- each is going without opening it.
create function public.my_leagues()
returns table (
  league_id    uuid,
  name         text,
  tier         public.league_tier,
  invite_code  text,
  is_owner     boolean,
  members      integer,
  my_status    text,
  my_rank      bigint,
  wins         integer,
  losses       integer,
  draws        integer,
  points       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name, l.tier, l.invite_code, l.owner_id = (select auth.uid()),
         (select count(*)::integer from public.league_members x
           where x.league_id = l.id and x.left_at is null),
         me.status, me.rank, me.wins, me.losses, me.draws, me.points
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  cross join lateral (
    select s.status, s.rank, s.wins, s.losses, s.draws, s.points
    from public.league_standings(l.id) s where s.is_me
  ) me
  where m.user_id = (select auth.uid()) and m.left_at is null
  order by m.joined_at;
$$;

revoke execute on function public.league_matchups(uuid), public.league_standings(uuid), public.my_leagues()
  from public, anon;
grant execute on function public.league_matchups(uuid), public.league_standings(uuid), public.my_leagues()
  to authenticated;
