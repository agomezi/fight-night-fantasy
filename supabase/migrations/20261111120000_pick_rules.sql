-- League rules, tried from the next card.
--
-- Minimum picks: a Pro league's owner sets how much of the card everyone has
-- to pick: the main event only, the main card, the whole card, or the top N
-- bouts (the main event and the next N-1 down the card, into the prelims).
-- Missing it loses that week's matchup, as missing the main event always
-- has. A change applies from the next card to start, so finished weeks never
-- change under anyone. Pro leagues play the main card from now on; cards
-- already started stay main event only. Casual and Amateur keep their fixed
-- ranges.
--
-- Forfeits: a win because the other side didn't make the required picks
-- still shows as a W, but adds half a win to the standings' win %.
--
-- (The softer round deduction is in the scoring code the results sync runs.)

-------------------------------------------------------------------------------
-- The rule, with its history
-------------------------------------------------------------------------------

create table public.league_pick_rules (
  league_id    uuid not null references public.leagues (id) on delete cascade,
  effective_at timestamptz not null default now(),
  scope        text not null check (scope in ('main_event', 'main_card', 'whole_card', 'top_n')),
  top_n        smallint check (top_n between 2 and 20),
  set_by       uuid references public.profiles (id) on delete set null,
  primary key (league_id, effective_at),
  check ((scope = 'top_n') = (top_n is not null))
);

alter table public.league_pick_rules enable row level security;
revoke all on public.league_pick_rules from public, anon, authenticated;

-- The rule a league plays a card under: the one in force when the card
-- started. No rule is the main event only, as before.
create function public.league_pick_rule(league uuid, at timestamptz)
returns table (scope text, top_n smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(r.scope, 'main_event'), r.top_n
  from (select 1) one
  left join lateral (
    select x.scope, x.top_n from public.league_pick_rules x
    where x.league_id = league and x.effective_at <= at
    order by x.effective_at desc limit 1
  ) r on true;
$$;

revoke execute on function public.league_pick_rule(uuid, timestamptz) from public, anon, authenticated, service_role;

-- The bouts a league requires picked on a card. Casual and Amateur: all of
-- their range. Pro and Hardcore: what the league's rule asks for. Cancelled
-- bouts, and ones whose fighters changed after the lock, are never required.
create function public.league_required_bouts(league uuid, event uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with lg as (
    select l.tier from public.leagues l where l.id = league
  ),
  rule as (
    select r.scope, r.top_n
    from public.events e, public.league_pick_rule(league, e.locks_at) r
    where e.id = event
  ),
  card as (
    select b.id, b.card_segment,
           row_number() over (order by b.fight_order) as pos
    from public.bouts b, lg
    where b.event_id = event and b.status = 'scheduled'
      and public.bout_counts_for_tier(lg.tier, b.id)
      and not public.changed_after_lock(b.id)
  )
  select c.id from card c, lg, rule r
  where case
    when lg.tier in ('casual', 'amateur') then true
    when r.scope = 'whole_card' then true
    when r.scope = 'main_card' then c.card_segment = 'main' or c.pos = 1
    when r.scope = 'top_n' then c.pos <= r.top_n
    else c.pos = 1
  end;
$$;

revoke execute on function public.league_required_bouts(uuid, uuid) from public, anon, authenticated, service_role;

-- met_tier_picks for a league: every required bout picked, as it stands now.
create function public.met_league_picks(league uuid, player uuid, event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.league_required_bouts(league, event))
     and not exists (
       select 1 from public.league_required_bouts(league, event) rb(id)
       join public.bouts b on b.id = rb.id
       where not exists (
         select 1 from public.picks k
         where k.bout_id = b.id and k.user_id = player and k.bout_version = b.version
       )
     );
$$;

revoke execute on function public.met_league_picks(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Pro leagues play the main card from now on, and new ones from the start.
insert into public.league_pick_rules (league_id, scope)
select l.id, 'main_card' from public.leagues l where l.tier in ('pro', 'hardcore');

create function public.default_pick_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tier in ('pro', 'hardcore') then
    insert into public.league_pick_rules (league_id, effective_at, scope)
    values (new.id, new.created_at, 'main_card');
  end if;
  return new;
end;
$$;

revoke execute on function public.default_pick_rule() from public, anon, authenticated, service_role;

create trigger leagues_default_pick_rule
  after insert on public.leagues
  for each row execute function public.default_pick_rule();

-- The owner changes the rule. It applies from the next card to start.
create function public.set_league_pick_rule(league uuid, scope text, top_n smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l  public.leagues%rowtype;
begin
  select * into l from public.leagues x where x.id = set_league_pick_rule.league;
  if not found or l.owner_id is distinct from me then
    raise exception 'Only the league''s owner can change its rules.' using errcode = 'P0001', hint = 'not_owner';
  end if;
  if l.tier not in ('pro', 'hardcore') then
    raise exception 'Only Pro leagues set their own minimum picks.' using errcode = 'P0001', hint = 'invalid';
  end if;
  if scope is null or scope not in ('main_event', 'main_card', 'whole_card', 'top_n') then
    raise exception 'Pick a minimum.' using errcode = 'P0001', hint = 'invalid';
  end if;
  if scope = 'top_n' and (top_n is null or top_n not between 2 and 20) then
    raise exception 'Pick between 2 and 20 fights.' using errcode = 'P0001', hint = 'invalid';
  end if;

  insert into public.league_pick_rules (league_id, effective_at, scope, top_n, set_by)
  values (l.id, clock_timestamp(), scope, case when scope = 'top_n' then top_n end, me);
end;
$$;

revoke execute on function public.set_league_pick_rule(uuid, text, smallint) from public, anon;
grant execute on function public.set_league_pick_rule(uuid, text, smallint) to authenticated;

-------------------------------------------------------------------------------
-- Everything that asked whether a player made their picks
-------------------------------------------------------------------------------

-- As before (20261105), each side's picks checked against the league's rule.
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


-- As before (20261110), against the league's rule.
create or replace function public.claim_matchup_notifications(event uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ev      public.events%rowtype;
  sig     text;
  changed boolean;
  lg      record;
  r       record;
  lead_by uuid;
  lo      uuid;
  hi      uuid;
  n       integer;
  side    record;
  body    jsonb;
begin
  select * into ev from public.events e where e.id = claim_matchup_notifications.event;
  if not found then
    return;
  end if;

  sig := (
    select count(*) || ':' || coalesce(max(s.computed_at)::text, '') || ':' || coalesce(sum(s.points), 0)
           || ':' || coalesce(sum(s.casual_points), 0)
    from public.scores s join public.bouts b on b.id = s.bout_id
    where b.event_id = ev.id
  );
  insert into public.matchup_lead_checks as c (event_id, scores_sig) values (ev.id, sig)
  on conflict (event_id) do update set scores_sig = excluded.scores_sig
    where c.scores_sig is distinct from excluded.scores_sig
  returning true into changed;
  if changed is null then
    return;
  end if;

  -- Every league with someone scored on this card.
  for lg in
    select distinct l.id, l.name, l.tier
    from public.leagues l
    join public.league_members m on m.league_id = l.id
    where exists (
      select 1 from public.scores s join public.bouts b on b.id = s.bout_id
      where s.user_id = m.user_id and b.event_id = ev.id
    )
  loop
    for r in
      select s.user_a, s.points_a, s.user_b, s.points_b
      from public.league_schedule(lg.id, public.current_season()) s
      -- Live, or final the same night, so the fight that decides it still
      -- counts when the card goes final in the same update.
      where s.event_id = ev.id and s.user_b is not null
        and (s.state = 'live' or (s.state = 'final' and ev.locks_at > now() - interval '12 hours'))
    loop
      -- Missing the tier's required picks loses whatever the points say, so
      -- a lead there means nothing.
      continue when not public.met_league_picks(lg.id, r.user_a, ev.id)
                 or not public.met_league_picks(lg.id, r.user_b, ev.id);
      lead_by := case when r.points_a > r.points_b then r.user_a
                      when r.points_b > r.points_a then r.user_b end;
      -- Level: the last leader stands.
      continue when lead_by is null;
      lo := least(r.user_a, r.user_b);
      hi := greatest(r.user_a, r.user_b);

      -- The first lead of the night is only noted.
      insert into public.matchup_leads as ml (event_id, league_id, user_a, user_b, leader)
      values (ev.id, lg.id, lo, hi, lead_by)
      on conflict do nothing;
      continue when found;

      n := null;
      update public.matchup_leads ml set leader = lead_by, flips = ml.flips + 1
      where ml.event_id = ev.id and ml.league_id = lg.id and ml.user_a = lo and ml.user_b = hi
        and ml.leader is distinct from lead_by
      returning ml.flips into n;
      continue when n is null or n > public.max_lead_pushes();

      for side in
        select x.me, x.opp, x.mine, x.theirs
        from (values (r.user_a, r.user_b, r.points_a, r.points_b),
                     (r.user_b, r.user_a, r.points_b, r.points_a)) x(me, opp, mine, theirs)
        join public.profiles p on p.id = x.me
        join public.profiles o on o.id = x.opp
        where p.deleted_at is null
          -- Still in the league: leaving keeps you in this season's rotation.
          and exists (
            select 1 from public.league_members m
            where m.league_id = lg.id and m.user_id = x.me and m.left_at is null
          )
          -- Nothing about a player you've blocked or who blocked you, or one
          -- who is gone, banned or suspended.
          and not exists (
            select 1 from public.player_blocks pb
            where (pb.blocker = x.me and pb.blocked = x.opp) or (pb.blocker = x.opp and pb.blocked = x.me)
          )
          and o.deleted_at is null
          and (select ps.standing from public.player_standing(x.opp) ps) is distinct from 'banned'
          and (select ps.standing from public.player_standing(x.opp) ps) is distinct from 'suspended'
      loop
        body := jsonb_build_object(
          'event', ev.name,
          'league', lg.name,
          'leagueId', lg.id,
          'opponent', public.league_display_name(side.opp),
          -- Which matchup, for a doubleheader week.
          'opponentId', side.opp,
          'mine', side.mine,
          'theirs', side.theirs,
          'lead', side.me = lead_by
        );
        insert into public.notifications_sent (user_id, kind, key, payload)
        values (side.me, 'matchup', ev.id || ':' || lg.id || ':' || side.opp || ':' || n, body)
        on conflict do nothing;
        continue when not found;

        user_id := side.me;
        kind := 'matchup';
        payload := body;
        tokens := array(select t.token from public.push_tokens t where t.user_id = side.me);
        wanted := (select p.notify_league_activity from public.profiles p where p.id = side.me);
        return next;
      end loop;
    end loop;
  end loop;
end;
$$;


-- As before (20261108): "locked in" is the league's rule.
create or replace function public.matchup_picks(league uuid, event uuid, opponent uuid)
returns table (
  bout_id         uuid,
  fight_order     smallint,
  card_segment    public.card_segment,
  -- The bout's section has started, so picks on it are final.
  locked          boolean,
  -- A fighter was replaced after the lock: no fight for anyone.
  voided          boolean,
  red_id          uuid,
  red_name        text,
  blue_id         uuid,
  blue_name       text,
  my_fighter      uuid,
  my_finish       public.finish_kind,
  my_round        smallint,
  my_method       public.pick_method,
  my_points       integer,
  their_fighter   uuid,
  their_finish    public.finish_kind,
  their_round     smallint,
  their_method    public.pick_method,
  their_points    integer,
  their_locked_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t  public.league_tier;
begin
  perform public.require_league_member(league);
  if not public.shares_league(league, opponent) then
    raise exception 'That player isn''t in this league.' using errcode = 'P0001', hint = 'not_member';
  end if;

  select l.tier into t from public.leagues l where l.id = league;

  return query
  with card as (
    select b.*,
           coalesce(b.locks_at, e.locks_at) <= now() as is_locked,
           public.changed_after_lock(b.id) as is_void
    from public.bouts b
    join public.events e on e.id = b.event_id
    where b.event_id = event and b.status = 'scheduled'
      and public.bout_counts_for_tier(t, b.id)
  ),
  -- Only picks made against the bout as it stands: one from before a
  -- fighter was replaced no longer applies.
  side as (
    select c.id as bout, k.user_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           (select case when t = 'casual' then s.casual_points else s.points end
            from public.scores s where s.user_id = k.user_id and s.bout_id = c.id) as pts
    from card c
    join public.picks k on k.bout_id = c.id and k.bout_version = c.version
    where k.user_id in (me, opponent)
  )
  select c.id, c.fight_order, c.card_segment, c.is_locked, c.is_void,
         c.red_fighter_id, rf.name, c.blue_fighter_id, bf.name,
         mine.picked_fighter_id, mine.finish, mine.finish_round, mine.method, mine.pts,
         theirs.picked_fighter_id, theirs.finish, theirs.finish_round, theirs.method, theirs.pts,
         public.met_league_picks(league, opponent, event)
  from card c
  join public.fighters rf on rf.id = c.red_fighter_id
  join public.fighters bf on bf.id = c.blue_fighter_id
  left join side mine on mine.bout = c.id and mine.user_id = me
  -- Nothing of theirs on a bout that hasn't locked, not even whether it's picked.
  left join side theirs on theirs.bout = c.id and theirs.user_id = opponent and c.is_locked
  order by c.fight_order;
end;
$$;


-------------------------------------------------------------------------------
-- Standings: forfeit wins count half
-------------------------------------------------------------------------------

-- league_table and league_standings gain forfeit_wins, so both are rebuilt.
-- my_leagues reads named columns of league_standings and is unaffected.
drop function public.league_standings(uuid);
drop function public.league_table(uuid);

create function public.league_table(league uuid)
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
  season_label  text,
  forfeit_wins  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season uuid := public.current_season();
begin
  return query
  with schedule as materialized (
    select mu.event_id, mu.user_a, mu.user_b, mu.winner, mu.state from public.league_schedule(league, season) mu
  ),
  finals as (
    select sc.user_a, sc.user_b, sc.winner,
           -- Won because the other side didn't make the league's required
           -- picks.
           sc.winner is not null and not public.met_league_picks(
             league, case when sc.winner = sc.user_a then sc.user_b else sc.user_a end, sc.event_id
           ) as forfeit
    from schedule sc
    where sc.state = 'final' and sc.user_b is not null
  ),
  outcomes as (
    select f.user_a as uid, f.user_b as opp, f.winner, f.forfeit from finals f
    union all
    select f.user_b, f.user_a, f.winner, f.forfeit from finals f
  ),
  tally as (
    select o.uid,
           count(*) filter (where o.winner = o.uid)::integer as w,
           count(*) filter (where o.winner = o.uid and o.forfeit)::integer as fw,
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
             when p.deleted_at is not null
               or (select ps.standing from public.player_standing(p.id) ps) = 'banned' then 'former'
             when season is null then 'active'
             else m.status::text
           end as st,
           case when season is null then m.left_at is null else m.status = 'active' end
             and exists (select 1 from schedule sc where sc.state <> 'upcoming')
             -- Not ranked until one of your picks has scored this season, so
             -- sitting on 0 with nothing settled can't climb past players
             -- who have.
             and t.user_id is not null as ranked,
           coalesce(rc.w, 0) as w, coalesce(rc.fw, 0) as fw, coalesce(rc.l, 0) as l, coalesce(rc.d, 0) as d,
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
           -- A win is 3, a forfeit win half that, a draw 1.
           case when r.w + r.l + r.d = 0 then 0
                else (3 * (r.w - r.fw) + 1.5 * r.fw + r.d)::numeric / (r.w + r.l + r.d) end as pct,
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
         coalesce((select 'SEASON ' || s.number from public.seasons s where s.id = season), 'PRE-SEASON'),
         h.fw
  from h2h h
  order by h.ranked desc, h.pct desc, h.pts desc, h.acc desc, h.h2h desc, h.st, public.league_display_name(h.uid);
end;
$$;

revoke execute on function public.league_table(uuid) from public, anon, authenticated, service_role;

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
  season_label  text,
  forfeit_wins  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_league_member(league);
  return query
  select t.rank, t.user_id, t.display_name, t.status, t.wins, t.losses, t.draws, t.points,
         t.correct, t.counted, t.is_me, t.is_owner, t.season_label, t.forfeit_wins
  from public.league_table(league) with ordinality t
  order by t.ordinality;
end;
$$;

revoke execute on function public.league_standings(uuid) from public, anon;
grant execute on function public.league_standings(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Reading the rule
-------------------------------------------------------------------------------

-- The rule each of your leagues plays its next card under, for the picks
-- screen and the league settings.
create function public.my_league_pick_rules()
returns table (league_id uuid, scope text, top_n smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.league_id, r.scope, r.top_n
  from public.league_members m
  cross join lateral public.league_pick_rule(m.league_id, 'infinity'::timestamptz) r
  where m.user_id = (select auth.uid()) and m.left_at is null;
$$;

revoke execute on function public.my_league_pick_rules() from public, anon;
grant execute on function public.my_league_pick_rules() to authenticated;
