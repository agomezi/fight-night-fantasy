-- Title fights.
--
-- A season ends in a playoff for the league's belt. After card 8 the table's
-- top five are seeded (top four in a league of four or five): card 9 is the
-- play-in, #4 vs #5; card 10 the semifinals, #1 vs the play-in winner and #2
-- vs #3; card 11 the title fight between the winners. A tie goes to the
-- better seed. Everyone outside a bracket matchup plays someone else outside
-- one, so nobody sits a card out.
--
-- The winner is the Champion and carries the belt into the next season. Every
-- matchup the Champion plays is a title fight: a win is a defense, a loss
-- leaves the title vacant until the next title fight. A Champion outside the
-- next season's top five gives it up when the seeds are set. The belt is
-- replayed from the saved results each time it's read, so a rescore moves it.
--
-- The season's final award drop names the belt holder Champ and the table's
-- #1 Top Seed. The midseason Interim Champ goes.

-------------------------------------------------------------------------------
-- Seeds and bracket rounds
-------------------------------------------------------------------------------

-- Which bracket round a saved matchup is. Null: a regular matchup.
alter table public.league_weeks
  add column stage text check (stage in ('play_in', 'semi', 'title'));

-- The field, saved when card 9 locks, so later results can't reseed it.
create table public.league_seeds (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  seed      smallint not null check (seed between 1 and 5),
  user_id   uuid not null,
  saved_at  timestamptz not null default now(),
  primary key (league_id, season_id, seed),
  unique (league_id, season_id, user_id)
);

alter table public.league_seeds enable row level security;

create policy "read seeds of your leagues" on public.league_seeds
  for select to authenticated using (public.is_league_member(league_id));

-- Written only by `save_league_week_pairings`.
revoke all on public.league_seeds from public, anon, authenticated;
grant select on public.league_seeds to authenticated, service_role;

-- How many players make the field: five from six players up, four in a
-- league of four or five.
create function public.title_field_size(players integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when players >= 6 then 5 when players >= 4 then 4 else 0 end;
$$;

revoke execute on function public.title_field_size(integer) from public, anon, authenticated;

-- The belt in a league after `through` weeks of a season, replayed from every
-- saved result since Season 1: who holds it (null: vacant), their defenses
-- since they won it, and the card they won it on.
create function public.league_title_state(league uuid, season uuid, through integer)
returns table (holder uuid, defenses integer, since_event uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target  integer := (select s.number from public.seasons s where s.id = season);
  r       record;
  champ   uuid;
  wins    integer := 0;
  since   uuid;
  checked uuid;
  crowned uuid;
begin
  if target is null then
    return query select null::uuid, 0, null::uuid;
    return;
  end if;

  for r in
    select lr.season_id, lr.week, lr.event_id, lr.user_a, lr.user_b, lr.winner, lw.stage,
           (select ls.seed from public.league_seeds ls
            where ls.league_id = league and ls.season_id = lr.season_id and ls.user_id = lr.user_a) as seed_a,
           (select ls.seed from public.league_seeds ls
            where ls.league_id = league and ls.season_id = lr.season_id and ls.user_id = lr.user_b) as seed_b
    from public.league_results lr
    join public.seasons sn on sn.id = lr.season_id
    left join public.league_weeks lw
      on lw.league_id = lr.league_id and lw.event_id = lr.event_id
     and lw.user_a = lr.user_a and lw.user_b = lr.user_b
    where lr.league_id = league
      and sn.number <= target
      and (sn.number < target or lr.week <= through)
    -- The title fight last in its week, so it settles the belt.
    order by sn.number, lr.week, lw.stage = 'title' nulls first, lr.user_a, lr.user_b
  loop
    -- A Champion outside the field gives the title up when it's set.
    if r.week >= 9 and checked is distinct from r.season_id then
      checked := r.season_id;
      if champ is not null
         and exists (select 1 from public.league_seeds ls where ls.league_id = league and ls.season_id = r.season_id)
         and not exists (select 1 from public.league_seeds ls
                         where ls.league_id = league and ls.season_id = r.season_id and ls.user_id = champ) then
        champ := null; wins := 0; since := null;
      end if;
    end if;

    if champ is not null and champ in (r.user_a, r.user_b) and r.winner is not null then
      if r.winner = champ then
        -- A forfeit win keeps the belt without a defense.
        if public.met_league_picks(league, case when r.user_a = champ then r.user_b else r.user_a end, r.event_id) then
          wins := wins + 1;
        end if;
      else
        champ := null; wins := 0; since := null;
      end if;
    end if;

    if r.stage = 'title' then
      crowned := coalesce(
        r.winner,
        case when coalesce(r.seed_a, 99) <= coalesce(r.seed_b, 99) then r.user_a else r.user_b end
      );
      if champ is distinct from crowned then
        champ := crowned; wins := 0; since := r.event_id;
      end if;
    end if;
  end loop;

  if through >= 9 and champ is not null
     and exists (select 1 from public.league_seeds ls where ls.league_id = league and ls.season_id = season)
     and not exists (select 1 from public.league_seeds ls
                     where ls.league_id = league and ls.season_id = season and ls.user_id = champ) then
    champ := null;
  end if;

  -- A Champion who left, deleted their account or was banned: vacant.
  if champ is not null and (
    not exists (select 1 from public.league_members m
                where m.league_id = league and m.user_id = champ and m.left_at is null)
    or exists (select 1 from public.profiles p where p.id = champ and p.deleted_at is not null)
    or (select ps.standing from public.player_standing(champ) ps) = 'banned'
  ) then
    champ := null;
  end if;

  if champ is null then
    return query select null::uuid, 0, null::uuid;
  else
    return query select champ, wins, since;
  end if;
end;
$$;

revoke execute on function public.league_title_state(uuid, uuid, integer) from public, anon, authenticated;

-- The seeds, best first: the saved field, or while the current season's card 9
-- hasn't locked, the table as it stands. Empty below four ranked players.
create function public.league_season_seeds(league uuid, season uuid)
returns table (seed integer, user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  prev    text;
  players integer;
  field   integer;
  ranked  uuid[];
begin
  if exists (select 1 from public.league_seeds ls where ls.league_id = league and ls.season_id = season) then
    return query
    select ls.seed::integer, ls.user_id from public.league_seeds ls
    where ls.league_id = league and ls.season_id = season
    order by ls.seed;
    return;
  end if;

  if season is null or season is distinct from public.current_season() then
    return;
  end if;

  select count(*) into players from public.league_members m
  where m.league_id = league and m.status = 'active';

  -- The table works out the schedule, whose last weeks would need these
  -- seeds; while they're being read, those weeks are left to the rotation.
  prev := current_setting('fnf.seeding', true);
  perform set_config('fnf.seeding', 'on', true);
  ranked := array(
    select t.user_id from public.league_table(league) with ordinality t
    where t.rank is not null and t.status = 'active'
    order by t.ordinality
  );
  perform set_config('fnf.seeding', coalesce(prev, ''), true);

  field := least(public.title_field_size(players), cardinality(ranked));
  if field < 4 then
    return;
  end if;

  return query select i, ranked[i] from generate_series(1, field) i;
end;
$$;

revoke execute on function public.league_season_seeds(uuid, uuid) from public, anon, authenticated;

-- One player's points on a card at the league's tier, as the schedule counts
-- them.
create function public.league_card_points(league uuid, season uuid, event uuid, member uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when public.league_season_tier(league, season) = 'casual'
                           then s.casual_points else s.points end), 0)::integer
  from public.scores s
  join public.bouts b on b.id = s.bout_id
  where b.event_id = event and s.user_id = member
    and public.bout_counts_for_tier(public.league_season_tier(league, season), b.id);
$$;

revoke execute on function public.league_card_points(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Who goes through from a bracket round between `a` and `b`: the saved
-- result, or while the card isn't final, whoever leads; a tie goes to the
-- better seed. A player no longer in the league gives the other a walkover.
-- Null while the round hasn't been played.
create function public.bracket_advance(league uuid, season uuid, stage text, a uuid, b uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ev       uuid;
  w        uuid;
  pa       integer;
  pb       integer;
  played_a boolean;
  played_b boolean;
  seed_a   integer;
  seed_b   integer;
  active_a boolean;
  active_b boolean;
begin
  if a is null or b is null then
    return coalesce(a, b);
  end if;

  select lw.event_id into ev from public.league_weeks lw
  where lw.league_id = league and lw.season_id = season and lw.stage = bracket_advance.stage
    and ((lw.user_a = a and lw.user_b = b) or (lw.user_a = b and lw.user_b = a));

  if ev is null then
    active_a := exists (select 1 from public.league_members m where m.league_id = league and m.user_id = a and m.status = 'active');
    active_b := exists (select 1 from public.league_members m where m.league_id = league and m.user_id = b and m.status = 'active');
    if active_a and not active_b then return a; end if;
    if active_b and not active_a then return b; end if;
    return null;
  end if;

  select ls.seed into seed_a from public.league_seeds ls
  where ls.league_id = league and ls.season_id = season and ls.user_id = a;
  select ls.seed into seed_b from public.league_seeds ls
  where ls.league_id = league and ls.season_id = season and ls.user_id = b;

  select lr.winner into w from public.league_results lr
  where lr.league_id = league and lr.event_id = ev
    and ((lr.user_a = a and lr.user_b = b) or (lr.user_a = b and lr.user_b = a));

  if w is null and not exists (
    select 1 from public.league_results lr
    where lr.league_id = league and lr.event_id = ev
      and ((lr.user_a = a and lr.user_b = b) or (lr.user_a = b and lr.user_b = a))
  ) then
    -- Not final yet: the lead as it stands, the way the schedule judges it.
    played_a := public.met_league_picks(league, a, ev);
    played_b := public.met_league_picks(league, b, ev);
    pa := public.league_card_points(league, season, ev, a);
    pb := public.league_card_points(league, season, ev, b);
    w := case
      when played_a and not played_b then a
      when played_b and not played_a then b
      when not played_a and not played_b then null
      when pa > pb then a
      when pb > pa then b
    end;
  end if;

  return coalesce(w, case when coalesce(seed_a, 99) <= coalesce(seed_b, 99) then a else b end);
end;
$$;

revoke execute on function public.bracket_advance(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Working out the weeks, with the bracket
-------------------------------------------------------------------------------

-- As before (20261203), plus each matchup's bracket round. Cards 9 to 11 of a
-- season put the bracket matchups first and pair everyone else among
-- themselves, fewest meetings first. In an odd league the Champion never
-- plays the extra matchup when someone else can, and in a bracket week nor
-- does a bracket player.
drop function public.league_pairings(uuid, uuid);

create function public.league_pairings(league uuid, season uuid)
returns table (
  week          integer,
  card_id       uuid,
  card_name     text,
  card_status   public.event_status,
  card_locks_at timestamptz,
  user_a        uuid,
  user_b        uuid,
  doubleheader  boolean,
  stage         text
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
  wk_s     text[];
  -- Every matchup so far this season, in step.
  hist_a   uuid[] := '{}'::uuid[];
  hist_b   uuid[] := '{}'::uuid[];
  hist_d   boolean[] := '{}'::boolean[];
  champ    uuid;
  seeds    uuid[];
  k        integer;
  semi_one uuid;
  fx_a     uuid[];
  fx_b     uuid[];
  fx_s     text[];
  pool     uuid[];
  p1       uuid;
  p2       uuid;
  lo       uuid;
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
      select array_agg(lw.user_a), array_agg(lw.user_b), array_agg(lw.doubleheader), array_agg(lw.stage)
        into wk_a, wk_b, wk_d, wk_s
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

      champ := null;
      if season is not null and n % 2 = 1 then
        select ts.holder into champ from public.league_title_state(league, season, c.w - 1) ts;
      end if;

      -- The bracket's matchups this week, if any.
      fx_a := '{}'::uuid[]; fx_b := '{}'::uuid[]; fx_s := '{}'::text[];
      if season is not null and c.w >= 9 and coalesce(current_setting('fnf.seeding', true), '') <> 'on'
         and not (c.id is not null and c.locks_at <= now() and c.locks_at < since) then
        seeds := array(select sd.user_id from public.league_season_seeds(league, season) sd order by sd.seed);
        k := cardinality(seeds);
        if k >= 4 then
          semi_one := case when k = 5
                           then public.bracket_advance(league, season, 'play_in', seeds[4], seeds[5])
                           else seeds[4] end;
          if c.w = 9 and k = 5 then
            fx_a := array[seeds[4]]; fx_b := array[seeds[5]]; fx_s := array['play_in'];
          elsif c.w = 10 then
            fx_a := array[seeds[1], seeds[2]]; fx_b := array[semi_one, seeds[3]]; fx_s := array['semi', 'semi'];
          elsif c.w = 11 then
            fx_a := array[public.bracket_advance(league, season, 'semi', seeds[1], semi_one)];
            fx_b := array[public.bracket_advance(league, season, 'semi', seeds[2], seeds[3])];
            fx_s := array['title'];
          end if;
          -- A round with a player missing (left, or not decided) isn't played;
          -- whoever is there plays someone outside the bracket.
          select coalesce(array_agg(x.a), '{}'), coalesce(array_agg(x.b), '{}'), coalesce(array_agg(x.s), '{}')
            into fx_a, fx_b, fx_s
          from unnest(fx_a, fx_b, fx_s) x(a, b, s)
          where x.a = any(members) and x.b = any(members) and x.a <> x.b;
        end if;
      end if;

      if c.id is not null and c.locks_at <= now() and c.locks_at < since then
        select array_agg(members[p.a + 1]), array_agg(members[p.b + 1]), array_agg(r.b is null), array_agg(null::text)
          into wk_a, wk_b, wk_d, wk_s
        from public.circle_pairings(n, c.w) p
        join public.circle_round(n, c.w) r on r.a = p.a;

      elsif cardinality(fx_a) > 0 then
        -- Bracket matchups first, then everyone else paired among themselves:
        -- the first in join order with whoever they've met least.
        wk_a := fx_a; wk_b := fx_b; wk_s := fx_s;
        wk_d := array_fill(false, array[cardinality(fx_a)]);
        pool := array(
          select u.x from unnest(members) with ordinality u(x, o)
          where not (u.x = any(fx_a || fx_b)) order by u.o
        );
        while cardinality(pool) >= 2 loop
          p1 := pool[1];
          select u.y into p2
          from unnest(pool[2:]) with ordinality u(y, o)
          order by (select count(*) from unnest(hist_a, hist_b) h(x, y)
                    where (h.x, h.y) in ((p1, u.y), (u.y, p1))),
                   u.o
          limit 1;
          wk_a := wk_a || p1; wk_b := wk_b || p2; wk_d := wk_d || false; wk_s := wk_s || null::text;
          pool := array_remove(array_remove(pool, p1), p2);
        end loop;
        -- One left over: a second matchup for someone outside the bracket and
        -- not the Champion where possible, then as the rotation picks.
        if cardinality(pool) = 1 then
          lo := pool[1];
          select u.m into p2
          from unnest(members) with ordinality u(m, i)
          where u.m <> lo
          order by u.m = any(fx_a || fx_b),
                   u.m is not distinct from champ,
                   (select count(*) from unnest(hist_b, hist_d) h(y, d) where h.d and h.y = u.m),
                   (select count(*) from unnest(hist_a, hist_b) h(x, y)
                     where (h.x, h.y) in ((u.m, lo), (lo, u.m))),
                   u.i
          limit 1;
          wk_a := wk_a || lo; wk_b := wk_b || p2; wk_d := wk_d || true; wk_s := wk_s || null::text;
        end if;

      else
        with r as (
          select cr.a, cr.b from public.circle_round(n, c.w) cr
        ),
        opponent as (
          -- The leftover's opponent: not the Champion where possible, then
          -- fewest matchups so far, then fewest meetings with the leftover,
          -- then join order. Everyone plays once a week, so fewest matchups is
          -- fewest extra ones; counting those keeps a pre-season player who
          -- joined late from doubling up every week.
          select i - 1 as pos
          from generate_series(1, n) i, (select r.a as lo from r where r.b is null) l
          where i - 1 <> l.lo
          order by
            members[i] is not distinct from champ,
            (select count(*) from unnest(hist_b, hist_d) h(y, d)
              where h.d and h.y = members[i]),
            (select count(*) from unnest(hist_a, hist_b) h(x, y)
              where (h.x, h.y) in ((members[i], members[l.lo + 1]), (members[l.lo + 1], members[i]))),
            i
          limit 1
        )
        select array_agg(members[r.a + 1]),
               array_agg(members[coalesce(r.b, (select o.pos from opponent o)) + 1]),
               array_agg(r.b is null),
               array_agg(null::text)
          into wk_a, wk_b, wk_d, wk_s
        from r;
      end if;
    end if;

    return query
    select c.w, c.id, c.name, c.status, c.locks_at, x.a, x.b, x.d, x.s
    from unnest(wk_a, wk_b, wk_d, wk_s) x(a, b, d, s);

    hist_a := hist_a || wk_a;
    hist_b := hist_b || wk_b;
    hist_d := hist_d || wk_d;
  end loop;
end;
$$;

revoke execute on function public.league_pairings(uuid, uuid) from public, anon, authenticated;

-- As before (20261203), saving each matchup's round, and card 9's seeds first.
create or replace function public.save_league_week_pairings(event uuid)
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
  slot  smallint;
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
  slot := (select e.season_index from public.events e where e.id = event);

  for lg in select l.id from public.leagues l loop
    if s.season is not null and slot = 9 then
      insert into public.league_seeds (league_id, season_id, seed, user_id)
      select lg, s.season, sd.seed, sd.user_id
      from public.league_season_seeds(lg, s.season) sd
      on conflict do nothing;
    end if;

    insert into public.league_weeks (league_id, season_id, event_id, user_a, user_b, doubleheader, stage)
    select lg, s.season, event, p.user_a, p.user_b, p.doubleheader, p.stage
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

-------------------------------------------------------------------------------
-- What the app reads
-------------------------------------------------------------------------------

-- The league's title picture this season: the Champion, the field (saved, or
-- projected from the table until card 9 locks) and the bracket matchups so
-- far. Null season: the pre-season, which has no title.
create function public.league_title(league uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season uuid := public.current_season();
  champ  record;
begin
  perform public.require_league_member(league);

  if season is null then
    return jsonb_build_object('season', null, 'champion', null, 'seeds', '[]'::jsonb,
                              'seedsFinal', false, 'bracket', '[]'::jsonb);
  end if;

  select * into champ from public.league_title_state(league, season, 11);

  return jsonb_build_object(
    'season', season,
    'champion', case when champ.holder is null then null else jsonb_build_object(
      'userId', champ.holder,
      'name', public.league_display_name(champ.holder),
      'defenses', champ.defenses
    ) end,
    'seedsFinal', exists (select 1 from public.league_seeds ls where ls.league_id = league and ls.season_id = season),
    'seeds', coalesce((
      select jsonb_agg(jsonb_build_object('seed', sd.seed, 'userId', sd.user_id) order by sd.seed)
      from public.league_season_seeds(league, season) sd
    ), '[]'::jsonb),
    'bracket', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stage', p.stage, 'week', p.week, 'eventId', p.card_id, 'a', p.user_a, 'b', p.user_b
      ) order by p.week, p.user_a)
      from public.league_pairings(league, season) p
      where p.stage is not null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.league_title(uuid) from public, anon;
grant execute on function public.league_title(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Telling the players
-------------------------------------------------------------------------------

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards',
                    'odds', 'schedule', 'rank', 'poll', 'name_restored', 'name_kept', 'tier', 'title'));

-- Once a card is final, each league's title news from it: the Champion lost
-- (the title is vacant) or defended, a bracket round won, a new Champion.
create function public.claim_title_notifications(event uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with games as (
    select lr.league_id, lr.season_id, lr.week, lr.event_id, lr.user_a, lr.user_b, lr.winner, lw.stage,
           l.name as league_name
    from public.league_results lr
    join public.leagues l on l.id = lr.league_id
    join public.events e on e.id = lr.event_id
    left join public.league_weeks lw
      on lw.league_id = lr.league_id and lw.event_id = lr.event_id
     and lw.user_a = lr.user_a and lw.user_b = lr.user_b
    where lr.event_id = claim_title_notifications.event
      and lr.season_id is not null
      and public.event_is_final(lr.event_id)
  ),
  weeks as (
    select distinct g.league_id, g.season_id, g.week from games g
  ),
  belts as materialized (
    select w.league_id,
           (select ts.holder from public.league_title_state(w.league_id, w.season_id, w.week - 1) ts) as before,
           a.holder as after, a.defenses
    from weeks w
    cross join lateral public.league_title_state(w.league_id, w.season_id, w.week) a
  ),
  sided as (
    select g.*, b.before, b.after, b.defenses,
           x.me, x.opp
    from games g
    join belts b on b.league_id = g.league_id
    cross join lateral (values (g.user_a, g.user_b), (g.user_b, g.user_a)) x(me, opp)
  ),
  news as (
    -- The Champion lost a matchup that wasn't the title fight.
    select s.me as uid, s.league_id, s.league_name, 'lost_title' as type, s.opp as about, null::text as stage, null::integer as defenses
    from sided s
    where s.me = s.before and s.winner = s.opp and s.stage is distinct from 'title'
    union all
    select s.me, s.league_id, s.league_name, 'beat_champ', s.opp, null, null
    from sided s
    where s.opp = s.before and s.winner = s.me and s.stage is distinct from 'title'
    union all
    select s.me, s.league_id, s.league_name, 'defended', s.opp, null, s.defenses
    from sided s
    where s.me = s.before and s.winner = s.me and s.after = s.me and s.stage is distinct from 'title'
      and public.met_league_picks(s.league_id, s.opp, s.event_id)
    union all
    select s.me, s.league_id, s.league_name, 'advanced', s.opp, s.stage, null
    from sided s
    where s.stage in ('play_in', 'semi')
      and s.me = public.bracket_advance(s.league_id, s.season_id, s.stage, s.user_a, s.user_b)
    union all
    select s.me, s.league_id, s.league_name, case when s.me = s.before then 'retained' else 'champion' end,
           s.opp, 'title', s.defenses
    from sided s
    where s.stage = 'title' and s.me = s.after
  ),
  candidates as (
    select distinct on (n.uid, n.league_id, n.type)
           n.uid as user_id, n.league_id || ':' || claim_title_notifications.event || ':' || n.type as key,
           jsonb_build_object('type', n.type, 'league', n.league_name, 'leagueId', n.league_id,
                              'opponent', public.league_display_name(n.about),
                              'stage', n.stage, 'defenses', n.defenses) as payload
    from news n
    join public.league_members m on m.league_id = n.league_id and m.user_id = n.uid and m.left_at is null
    join public.profiles p on p.id = n.uid and p.deleted_at is null
    order by n.uid, n.league_id, n.type
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'title', c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  select c.user_id, 'title'::text, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_league_activity
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.key
  join public.profiles p on p.id = c.user_id;
$$;

revoke execute on function public.claim_title_notifications(uuid) from public, anon, authenticated;
grant execute on function public.claim_title_notifications(uuid) to service_role;

-- Within the hour before a season card locks: who has a title fight or a
-- bracket round on it, once each.
create function public.claim_title_reminders()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with cards as (
    select e.id, e.season_id from public.events e
    where e.status = 'scheduled' and e.season_id is not null
      and e.locks_at > now() and e.locks_at <= now() + interval '60 minutes'
  ),
  games as (
    select l.id as league_id, l.name as league_name, c.id as event_id, p.week, p.user_a, p.user_b, p.stage,
           (select ts.holder from public.league_title_state(l.id, c.season_id, p.week - 1) ts) as champ
    from cards c
    cross join public.leagues l
    cross join lateral public.league_pairings(l.id, c.season_id) p
    where p.card_id = c.id
  ),
  sided as (
    select g.*, x.me, x.opp
    from games g
    cross join lateral (values (g.user_a, g.user_b), (g.user_b, g.user_a)) x(me, opp)
    where g.stage is not null or g.champ in (g.user_a, g.user_b)
  ),
  candidates as (
    -- A bracket round before a defense, if someone has both.
    select distinct on (s.me, s.league_id)
           s.me as user_id, s.league_id || ':' || s.event_id || ':tonight' as key,
           jsonb_build_object(
             'type', 'tonight', 'league', s.league_name, 'leagueId', s.league_id,
             'opponent', public.league_display_name(s.opp),
             'stage', coalesce(s.stage, case when s.me = s.champ then 'defense' else 'challenge' end)
           ) as payload
    from sided s
    join public.league_members m on m.league_id = s.league_id and m.user_id = s.me and m.left_at is null
    join public.profiles p on p.id = s.me and p.deleted_at is null
    order by s.me, s.league_id, s.stage is null
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'title', c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  select c.user_id, 'title'::text, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_league_activity
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.key
  join public.profiles p on p.id = c.user_id;
$$;

revoke execute on function public.claim_title_reminders() from public, anon, authenticated;
grant execute on function public.claim_title_reminders() to service_role;

-------------------------------------------------------------------------------
-- The inbox
-------------------------------------------------------------------------------

-- Every kind, for this build on.
create function public.inbox_items_v5(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.kind, n.key,
    case
      when n.kind = 'league_join'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 2)
       )
      then jsonb_set(n.payload, '{member}', '"Blocked player"')
      when n.kind = 'league_join' and public.name_hidden(split_part(n.key, ':', 2)::uuid)
      then jsonb_set(n.payload, '{member}', to_jsonb(public.hidden_name(split_part(n.key, ':', 2)::uuid)))
      when n.kind = 'matchup'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 3)
       )
      then jsonb_set(n.payload, '{opponent}', '"Blocked player"')
      when n.kind = 'matchup' and public.name_hidden(split_part(n.key, ':', 3)::uuid)
      then jsonb_set(n.payload, '{opponent}', to_jsonb(public.hidden_name(split_part(n.key, ':', 3)::uuid)))
      else n.payload
    end,
    n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;

create function public.inbox_unread_count_v5()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

-- The builds before this one leave title news out. inbox_items_v3 and the
-- older ones read through v4.
create or replace function public.inbox_items_v4(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items_v5(200) with ordinality i
  where i.kind <> 'title'
  order by i.ordinality
  limit least(greatest(max_rows, 1), 200);
$$;

create or replace function public.inbox_unread_count_v4()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind <> 'title';
$$;

create or replace function public.inbox_unread_count_v3()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('tier', 'title');
$$;

create or replace function public.inbox_unread_count_v2()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('name_restored', 'name_kept', 'tier', 'title');
$$;

create or replace function public.inbox_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('poll', 'name_restored', 'name_kept', 'tier', 'title');
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank', 'poll', 'name_restored',
                       'name_kept', 'tier', 'title');
$$;

revoke execute on function public.inbox_items_v5(integer), public.inbox_unread_count_v5() from public, anon;
grant execute on function public.inbox_items_v5(integer), public.inbox_unread_count_v5() to authenticated;

-------------------------------------------------------------------------------
-- Season awards
-------------------------------------------------------------------------------

-- As before (20261209), with the title: see the league titles step.
create or replace function public.compute_award_drop(drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
begin
  select * into d from public.award_drops x where x.id = compute_award_drop.drop;

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
      and public.bout_counts_for_tier(public.league_tier_for(l.id, b.event_id), b.bout_id)
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

  -- League titles. In the pre-season, the #1: Interim Champ at a review,
  -- Champ at a final one. In a season, a final drop names the belt holder
  -- Champ (their defenses as the value) and the table's #1 Top Seed; a
  -- review names neither.
  if d.season_id is null then
    insert into public.drop_awards (drop_id, scope, award, user_id, value)
    select d.id, ds.scope, case when d.kind = 'final' then 'champ' else 'interim_champ' end, ds.user_id, null
    from public.drop_stats ds
    where ds.drop_id = d.id and ds.scope <> 'global' and (ds.stats->>'rank')::int = 1;
  elsif d.kind = 'final' then
    insert into public.drop_awards (drop_id, scope, award, user_id, value)
    select d.id, l.id::text, 'champ', ts.holder, ts.defenses
    from public.leagues l
    cross join lateral public.league_title_state(l.id, d.season_id, 11) ts
    where ts.holder is not null
      and exists (select 1 from public.drop_stats ds where ds.drop_id = d.id and ds.scope = l.id::text);

    insert into public.drop_awards (drop_id, scope, award, user_id, value)
    select d.id, ds.scope, 'top_seed', ds.user_id, null
    from public.drop_stats ds
    where ds.drop_id = d.id and ds.scope <> 'global' and (ds.stats->>'rank')::int = 1;
  end if;

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
