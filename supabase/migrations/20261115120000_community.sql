-- Community cards: one card on Home at a time, picked here by where we are in
-- fight week.
--
--   fight night       the main-event take, with its split and the crowd's pick
--   card final +2d    the card's top performers, and how the main-event take went
--   fight week        a day each for the main-event take, a hot take and a league card
--   otherwise         a league card, else the last card's top performers
--
-- Takes are yes/no polls. The app generates them from the card (they resolve
-- themselves from results), and the owner can add more from the SQL editor:
--
--   select public.add_hot_take('<event id>', 'Does anyone get a bonus for a spinning attack?');
--   select public.resolve_hot_take('<poll id>', 'yes');   -- or 'no', or 'void'
--   select public.delete_hot_take('<poll id>');
--
-- Nobody sees the split before voting or before the take closes, and nobody
-- sees how the crowd picked a fight before it locks.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.community_polls (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  kind         text not null check (kind in ('main_event', 'hot_take')),
  -- Keeps a generated take from being made twice.
  slug         text not null,
  question     text not null check (char_length(question) between 1 and 140),
  options      jsonb not null default '["yes", "no"]'
                 check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  -- A take about one fight is called off if that fight is, or if a fighter is replaced.
  bout_id      uuid references public.bouts (id) on delete cascade,
  bout_version integer,
  -- Closes when its fight locks (or the card's first section, with no fight),
  -- unless the owner set a time.
  closes_at    timestamptz,
  -- How a generated take resolves from results; null for the owner's.
  resolves     jsonb,
  -- The owner's answer: an option, or 'void'. Overrides `resolves`.
  answer       text,
  created_at   timestamptz not null default now(),
  unique (event_id, slug),
  check ((bout_id is null) = (bout_version is null))
);

create table public.poll_votes (
  poll_id  uuid not null references public.community_polls (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  option   text not null,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- When each card first went final. Corrections later stamp results again, so
-- this is kept once rather than worked out from them.
create table public.community_finals (
  event_id uuid primary key references public.events (id) on delete cascade,
  final_at timestamptz not null default now()
);

alter table public.community_polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.community_finals enable row level security;
revoke all on public.community_polls, public.poll_votes, public.community_finals from public, anon, authenticated;

-- Cards already final keep the time their last result was stamped.
insert into public.community_finals (event_id, final_at)
select e.id, coalesce((select max(r.updated_at) from public.bouts b join public.results r on r.bout_id = b.id
                       where b.event_id = e.id), e.starts_at)
from public.events e
where public.event_is_final(e.id);

-------------------------------------------------------------------------------
-- Takes
-------------------------------------------------------------------------------

-- Players left out of every count and list here: banned, suspended or
-- deleted. Worked out once per call rather than per row, as player_standing
-- does it.
create function public.sidelined_players()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.player from (
    select distinct on (a.player) a.player, a.action, a.expires_at
    from public.moderation_actions a
    where a.action in ('suspend', 'ban', 'lift')
    order by a.player, a.created_at desc, a.id desc
  ) l
  where l.action = 'ban' or (l.action = 'suspend' and l.expires_at > now())
  union
  select p.id from public.profiles p where p.deleted_at is not null;
$$;

create function public.poll_close_at(poll uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.closes_at, b.locks_at, e.locks_at)
  from public.community_polls p
  join public.events e on e.id = p.event_id
  left join public.bouts b on b.id = p.bout_id
  where p.id = poll;
$$;

-- An option, 'void', or null while it's still to be decided. Only final
-- results count.
create function public.poll_outcome(poll uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_polls%rowtype;
  b public.bouts%rowtype;
  r public.results%rowtype;
  rule text;
begin
  select * into p from public.community_polls x where x.id = poll;
  if p.answer is not null then
    return p.answer;
  end if;
  rule := p.resolves->>'type';
  if rule is null then
    return null;
  end if;

  if rule = 'any_round1_finish' then
    -- Fights replaced after lock are left out: nobody voted knowing them.
    if exists (
      select 1 from public.bouts x join public.results y on y.bout_id = x.id
      where x.event_id = p.event_id and x.status = 'scheduled'
        and not public.changed_after_lock(x.id)
        and y.status = 'final' and y.method in ('KO', 'SUB') and y.round = 1
    ) then
      return 'yes';
    end if;
    return case when public.event_is_final(p.event_id) then 'no' end;
  end if;

  select * into b from public.bouts x where x.id = p.bout_id;
  if not found or b.status = 'cancelled' or b.version <> p.bout_version then
    return 'void';
  end if;
  select * into r from public.results x where x.bout_id = b.id;
  if not found or r.status <> 'final' then
    return null;
  end if;

  if r.void_reason = 'DRAW' then
    -- Nobody finished or won; a draw goes to the cards.
    return case rule when 'goes_distance' then 'yes' else 'no' end;
  elsif r.void_reason is not null then
    return 'void';
  end if;

  return case rule
    when 'finish_by_round' then
      case when r.winner_fighter_id = (p.resolves->>'fighter')::uuid
                and r.method in ('KO', 'SUB')
                and r.round <= (p.resolves->>'round')::int
           then 'yes' else 'no' end
    when 'wins' then
      case when r.winner_fighter_id = (p.resolves->>'fighter')::uuid then 'yes' else 'no' end
    when 'goes_distance' then
      case when r.method = 'DEC' then 'yes' else 'no' end
  end;
end;
$$;

-- The card's main event as it stands: its first fight still on.
create function public.current_main_event(event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.bouts b
  where b.event_id = event and b.status = 'scheduled'
  order by b.fight_order limit 1;
$$;

-- Makes the card's generated takes. Each is made once, before its fight
-- locks; a fight replaced before lock gets fresh ones.
create function public.ensure_polls(event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  main  record;
  dog   record;
begin
  select b.id, b.version, b.red_fighter_id, b.blue_fighter_id,
         coalesce(b.locks_at, e.locks_at) as lock_at, red.name as red_name, blue.name as blue_name
    into main
  from public.bouts b
  join public.events e on e.id = b.event_id
  join public.fighters red on red.id = b.red_fighter_id
  join public.fighters blue on blue.id = b.blue_fighter_id
  where b.id = public.current_main_event(event);

  if main.id is not null and main.lock_at > now() then
    insert into public.community_polls (event_id, kind, slug, question, bout_id, bout_version, resolves)
    values
      (event, 'main_event', 'main_event:' || main.id || ':' || main.version,
       format('Does %s finish %s inside 2 rounds?', main.red_name, main.blue_name),
       main.id, main.version,
       jsonb_build_object('type', 'finish_by_round', 'fighter', main.red_fighter_id, 'round', 2)),
      (event, 'hot_take', 'distance:' || main.id || ':' || main.version,
       format('Do %s and %s go the distance?', main.red_name, main.blue_name),
       main.id, main.version, '{"type": "goes_distance"}')
    on conflict (event_id, slug) do nothing;
  end if;

  if exists (select 1 from public.events e where e.id = event and e.locks_at > now()) then
    insert into public.community_polls (event_id, kind, slug, question, resolves)
    values (event, 'hot_take', 'round1', 'Will any fight end in round 1?', '{"type": "any_round1_finish"}')
    on conflict (event_id, slug) do nothing;
  end if;

  -- The longest-priced underdog still open, once odds are in. Made once a
  -- card, so later price moves don't start a second one.
  select b.id, b.version, dogf.id as dog_id, dogf.name as dog_name, fav.name as fav_name
    into dog
  from public.bouts b
  join public.events e on e.id = b.event_id
  join public.fighters dogf on dogf.id = case b.underdog_corner when 'red' then b.red_fighter_id else b.blue_fighter_id end
  join public.fighters fav on fav.id = case b.underdog_corner when 'red' then b.blue_fighter_id else b.red_fighter_id end
  where b.event_id = event and b.status = 'scheduled' and b.underdog_corner is not null
    and b.red_odds is not null and coalesce(b.locks_at, e.locks_at) > now()
  order by case b.underdog_corner when 'red' then b.red_odds else b.blue_odds end desc, b.fight_order
  limit 1;

  if dog.id is not null then
    insert into public.community_polls (event_id, kind, slug, question, bout_id, bout_version, resolves)
    values (event, 'hot_take', 'dog', format('Does %s pull off the upset against %s?', dog.dog_name, dog.fav_name),
            dog.id, dog.version, jsonb_build_object('type', 'wins', 'fighter', dog.dog_id))
    on conflict (event_id, slug) do nothing;
  end if;
end;
$$;

-- Run by cron: notes cards that have just gone final, and makes the takes for
-- cards in the coming week.
create function public.ensure_community()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev uuid;
begin
  insert into public.community_finals (event_id)
  select e.id from public.events e
  where e.status = 'complete'
    and not exists (select 1 from public.community_finals f where f.event_id = e.id)
    and public.event_is_final(e.id)
  on conflict do nothing;

  for ev in
    select e.id from public.events e
    where e.status in ('scheduled', 'live')
      and e.starts_at < now() + interval '7 days'
      and exists (select 1 from public.bouts b where b.event_id = e.id and b.status = 'scheduled'
                  and coalesce(b.locks_at, e.locks_at) > now())
  loop
    perform public.ensure_polls(ev);
  end loop;
end;
$$;

-- A take as the app shows it to `me`.
create function public.poll_payload(poll uuid, me uuid, at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p        public.community_polls%rowtype;
  close_at timestamptz := public.poll_close_at(poll);
  is_open  boolean;
  mine     text;
  n        integer;
  split    jsonb;
  crowd    jsonb;
begin
  select * into p from public.community_polls x where x.id = poll;
  if not found then
    return null;
  end if;
  is_open := at < close_at;
  select v.option into mine from public.poll_votes v where v.poll_id = poll and v.user_id = me;

  -- Sidelined players' votes don't count.
  with counted as (
    select v.option from public.poll_votes v
    where v.poll_id = poll
      and not exists (select 1 from public.sidelined_players() x where x.user_id = v.user_id)
  )
  select count(*)::int,
         (select jsonb_object_agg(o.value, (select count(*) from counted c where c.option = o.value))
          from jsonb_array_elements_text(p.options) o)
    into n, split
  from counted;

  -- How the crowd picked the fight, once it has locked.
  if p.kind = 'main_event' and p.bout_id is not null and not is_open then
    select jsonb_build_object('fighter', f.name, 'pct', round(100.0 * t.picked / t.total)::int, 'picks', t.total)
      into crowd
    from (
      select k.picked_fighter_id, count(*) as picked, sum(count(*)) over () as total
      from public.picks k join public.bouts b on b.id = k.bout_id
      where k.bout_id = p.bout_id and k.bout_version = b.version
      group by k.picked_fighter_id
    ) t
    join public.fighters f on f.id = t.picked_fighter_id
    where t.total >= 3
    order by t.picked desc, f.name
    limit 1;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'question', p.question,
    'options', p.options,
    'event_name', (select e.name from public.events e where e.id = p.event_id),
    'closes_at', close_at,
    'open', is_open,
    'votes', n,
    'my_vote', mine,
    'split', case when mine is not null or not is_open then split end,
    'consensus', crowd,
    'outcome', public.poll_outcome(poll)
  );
end;
$$;

-------------------------------------------------------------------------------
-- Cards
-------------------------------------------------------------------------------

-- The card's best three, and the boldest call that landed.
create function public.top_performers(event uuid, me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with out_ as (
    select x.user_id from public.sidelined_players() x
  ),
  players as (
    select s.user_id, sum(s.points)::int as points, count(*) filter (where s.correct)::int as hits
    from public.scores s
    join public.bouts b on b.id = s.bout_id and b.status = 'scheduled'
    where b.event_id = event
      and not exists (select 1 from out_ o where o.user_id = s.user_id)
    group by s.user_id
  ),
  ranked as (
    select p.*, rank() over (order by p.points desc, p.hits desc) as place from players p
  ),
  -- An underdog called right down to the method and round (or the decision),
  -- by the smallest share of the players who picked that fight.
  calls as (
    select k.user_id, f.name as fighter, k.finish, k.finish_round, k.method,
           count(*) over (partition by k.bout_id, k.picked_fighter_id)::numeric
             / count(*) over (partition by k.bout_id) as share,
           count(*) over (partition by k.bout_id, k.picked_fighter_id) as with_them,
           count(*) over (partition by k.bout_id) as on_fight,
           case b.underdog_corner when 'red' then b.red_odds else b.blue_odds end as odds,
           k.created_at,
           r.winner_fighter_id = k.picked_fighter_id
             and (case when k.picked_fighter_id = b.red_fighter_id then 'red' else 'blue' end) = b.underdog_corner::text
             and ((k.finish = 'DEC' and r.method = 'DEC')
                  or (k.finish = 'round' and k.finish_round = r.round and k.method::text = r.method::text))
             as nailed
    from public.picks k
    join public.bouts b on b.id = k.bout_id and k.bout_version = b.version and b.status = 'scheduled'
    join public.results r on r.bout_id = b.id and r.status = 'final' and r.void_reason is null
    join public.fighters f on f.id = k.picked_fighter_id
    where b.event_id = event and b.underdog_corner is not null and not public.changed_after_lock(b.id)
  ),
  boldest as (
    select c.* from calls c
    join players p on p.user_id = c.user_id
    where c.nailed
    order by c.share, c.odds desc nulls last, c.created_at
    limit 1
  )
  select jsonb_build_object(
    'type', 'top_performers',
    'event_name', (select e.name from public.events e where e.id = event),
    'has_dogs', exists (select 1 from public.bouts b where b.event_id = event and b.status = 'scheduled'
                        and b.underdog_corner is not null),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('place', r.place, 'name', public.league_display_name(r.user_id),
                                          'points', r.points, 'is_me', r.user_id = me) order by r.place, r.points desc)
      from ranked r where r.place <= 3), '[]'::jsonb),
    'me', (select jsonb_build_object('place', r.place, 'points', r.points, 'field', (select count(*) from players))
           from ranked r where r.user_id = me),
    'ball_knowledge', (
      select jsonb_build_object('name', public.league_display_name(b.user_id), 'is_me', b.user_id = me,
                                'fighter', b.fighter, 'finish', b.finish, 'finish_round', b.finish_round,
                                'method', b.method, 'odds', b.odds,
                                'with_them', b.with_them, 'on_fight', b.on_fight)
      from boldest b)
  )
  where exists (select 1 from players);
$$;

-- A league's recap of its last card: its top scorer, its bottom scorer (the
-- Can Man), the player dead in the middle (the Jobber, with 5 or more), or the
-- correct pick the fewest of them made. Null with under 3 players on the card.
create function public.league_card(league uuid, me uuid, event uuid, kind text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lg as (
    select l.id, l.name, l.tier, e.name as event_name, coalesce(min(coalesce(b.locks_at, e.locks_at)), e.locks_at) as lock_at
    from public.leagues l, public.events e
    left join public.bouts b on b.event_id = e.id and b.status = 'scheduled'
    where l.id = league and e.id = event
    group by l.id, l.name, l.tier, e.name, e.locks_at
  ),
  out_ as (
    select x.user_id from public.sidelined_players() x
  ),
  -- Members on the card when it locked, on the fights the league's tier plays.
  picks as (
    select k.user_id, k.bout_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           s.points, s.correct, b.red_fighter_id, r.method as r_method, r.round as r_round
    from lg
    join public.league_members m on m.league_id = lg.id
      and m.joined_at <= lg.lock_at and (m.left_at is null or m.left_at > lg.lock_at)
    join public.picks k on k.user_id = m.user_id
    join public.bouts b on b.id = k.bout_id and b.event_id = event and b.status = 'scheduled'
      and k.bout_version = b.version and public.bout_counts_for_tier(lg.tier, b.id)
    join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id
    left join public.results r on r.bout_id = b.id
    where not exists (select 1 from out_ o where o.user_id = m.user_id)
  ),
  totals as (
    select p.user_id, sum(p.points)::int as points from picks p group by p.user_id
  ),
  crafty as (
    select p.*, f.name as fighter,
           count(*) over (partition by p.bout_id, p.picked_fighter_id) as with_them,
           count(*) over (partition by p.bout_id) as on_fight
    from picks p join public.fighters f on f.id = p.picked_fighter_id
  ),
  craftiest as (
    select c.* from crafty c
    where c.correct and c.with_them < c.on_fight
    order by c.with_them::numeric / c.on_fight,
             ((c.finish = 'DEC' and c.r_method = 'DEC')
              or (c.finish = 'round' and c.finish_round = c.r_round and c.method::text = c.r_method::text)) desc,
             c.points desc
    limit 1
  )
  select jsonb_build_object(
    'type', 'league',
    'kind', kind,
    'league_name', lg.name,
    'event_name', lg.event_name,
    'players', (select count(*) from totals),
    'pick', case kind
      when 'craftiest' then (
        select jsonb_build_object('name', public.league_display_name(c.user_id), 'is_me', c.user_id = me,
                                  'fighter', c.fighter, 'finish', c.finish, 'finish_round', c.finish_round,
                                  'method', c.method, 'points', c.points,
                                  'with_them', c.with_them, 'on_fight', c.on_fight)
        from craftiest c)
      when 'jobber' then (
        select jsonb_build_object('name', public.league_display_name(t.user_id), 'is_me', t.user_id = me, 'points', t.points)
        from (select t.*, row_number() over (order by t.points desc, t.user_id) as place from totals t) t
        where t.place = ((select count(*) from totals) + 1) / 2)
      else (
        select jsonb_build_object('name', public.league_display_name(t.user_id), 'is_me', t.user_id = me, 'points', t.points)
        from totals t
        order by case when kind = 'losers' then t.points else -t.points end, t.user_id
        limit 1)
      end
  )
  from lg
  where (select count(*) from totals) >= case when kind = 'jobber' then 5 else 3 end
    and (kind <> 'craftiest' or exists (select 1 from craftiest));
$$;

-- The card for `me` at `at`. The app calls community_card(); this takes the
-- time so tests can walk through a week.
create function public.community_card_at(league uuid, me uuid, at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  night    uuid;
  last_ev  uuid;
  final_at timestamptz;
  nxt      uuid;
  poll     uuid;
  my_lg    uuid;
  day      integer := ((at at time zone 'America/New_York')::date - date '2026-01-01');
  card     jsonb;
  slot     text;
begin
  -- Only a league the caller is in.
  select m.league_id into my_lg from public.league_members m
  where m.league_id = league and m.user_id = me and m.left_at is null;

  -- Fight night: a card under way (or finished, with results not yet final).
  select e.id into night from public.events e
  where e.status <> 'cancelled' and e.locks_at <= at and e.starts_at > at - interval '3 days'
    and not public.event_is_final(e.id)
  order by e.locks_at desc limit 1;
  if night is not null then
    select p.id into poll from public.community_polls p
    where p.event_id = night and p.kind = 'main_event'
    order by (p.bout_id = public.current_main_event(night)) desc nulls last, p.created_at desc
    limit 1;
    if poll is not null then
      return jsonb_build_object('type', 'poll', 'phase', 'live', 'poll', public.poll_payload(poll, me, at));
    end if;
  end if;

  -- The last card final. One that went final since the cron last ran counts
  -- from now.
  select e.id, coalesce(f.final_at, at) into last_ev, final_at
  from public.events e
  left join public.community_finals f on f.event_id = e.id
  where f.event_id is not null
     or (e.status = 'complete' and e.locks_at <= at and e.starts_at > at - interval '3 days'
         and public.event_is_final(e.id))
  order by e.starts_at desc limit 1;

  -- Just final: who did best, and how the main-event take went.
  if last_ev is not null and at < final_at + interval '2 days' then
    card := public.top_performers(last_ev, me);
    if card is not null then
      select p.id into poll from public.community_polls p
      where p.event_id = last_ev and p.kind = 'main_event'
      order by (p.bout_id = public.pro_main_event(last_ev)) desc nulls last, p.created_at desc
      limit 1;
      return card || jsonb_build_object('recap', case when poll is not null then public.poll_payload(poll, me, at) end);
    end if;
  end if;

  -- Fight week: the main-event take, a hot take and a league card, a day each.
  select e.id into nxt from public.events e
  where e.status in ('scheduled', 'live') and e.locks_at > at and e.starts_at <= at + interval '6 days'
  order by e.locks_at limit 1;

  if nxt is not null then
    foreach slot in array (case day % 3
      when 0 then array['main', 'hot', 'league']
      when 1 then array['hot', 'main', 'league']
      else array['league', 'main', 'hot'] end)
    loop
      poll := null;
      if slot = 'main' then
        select p.id into poll from public.community_polls p
        where p.event_id = nxt and p.kind = 'main_event' and p.bout_id = public.current_main_event(nxt)
          and p.bout_version = (select b.version from public.bouts b where b.id = p.bout_id)
          and at < public.poll_close_at(p.id)
        order by p.created_at desc limit 1;
      elsif slot = 'hot' then
        select h.id into poll from (
          select p.id, row_number() over (order by p.created_at, p.slug) - 1 as i, count(*) over () as n
          from public.community_polls p
          where p.event_id = nxt and p.kind = 'hot_take' and at < public.poll_close_at(p.id)
            and public.poll_outcome(p.id) is distinct from 'void'
        ) h
        where h.i = (day / 3) % h.n;
      elsif my_lg is not null and last_ev is not null then
        card := public.league_card(my_lg, me, last_ev, (array['top_predictor', 'losers', 'craftiest', 'jobber'])[(day / 3) % 4 + 1]);
        if card is not null then
          return card;
        end if;
      end if;
      if poll is not null then
        return jsonb_build_object('type', 'poll', 'phase', 'open', 'poll', public.poll_payload(poll, me, at));
      end if;
    end loop;
  end if;

  -- Between cards: a league card, else the last card's best.
  if last_ev is not null then
    if my_lg is not null then
      foreach slot in array (case day % 4
        when 0 then array['top_predictor', 'losers', 'craftiest', 'jobber']
        when 1 then array['losers', 'craftiest', 'jobber', 'top_predictor']
        when 2 then array['craftiest', 'jobber', 'top_predictor', 'losers']
        else array['jobber', 'top_predictor', 'losers', 'craftiest'] end)
      loop
        card := public.league_card(my_lg, me, last_ev, slot);
        if card is not null then
          return card;
        end if;
      end loop;
    end if;
    card := public.top_performers(last_ev, me);
    if card is not null then
      return card;
    end if;
  end if;

  return '{"type": "none"}'::jsonb;
end;
$$;

create function public.community_card(league uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.community_card_at(league, (select auth.uid()), now());
$$;

create function public.vote_poll(poll uuid, choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  p  public.community_polls%rowtype;
begin
  if me is null then
    raise exception 'Sign in to vote.' using errcode = 'P0001', hint = 'signed_out';
  end if;
  perform public.require_good_standing(me);
  select * into p from public.community_polls x where x.id = poll;
  if not found then
    raise exception 'That take is gone.' using errcode = 'P0001', hint = 'missing';
  end if;
  if now() >= public.poll_close_at(poll) or p.answer is not null
     or public.poll_outcome(poll) is not distinct from 'void' then
    raise exception 'This take has closed.' using errcode = 'P0001', hint = 'closed';
  end if;
  if not p.options ? choice then
    raise exception 'Not an option.' using errcode = 'P0001', hint = 'bad_option';
  end if;

  insert into public.poll_votes (poll_id, user_id, option) values (poll, me, choice)
  on conflict (poll_id, user_id) do update set option = excluded.option, voted_at = now();

  return public.poll_payload(poll, me, now());
end;
$$;

-- Your takes record: settled takes you voted on.
create function public.takes_record()
returns table (wins integer, losses integer)
language sql
stable
security definer
set search_path = ''
as $$
  with settled as (
    select v.option, public.poll_outcome(v.poll_id) as outcome
    from public.poll_votes v where v.user_id = (select auth.uid())
  )
  select count(*) filter (where s.option = s.outcome)::int,
         count(*) filter (where s.option <> s.outcome)::int
  from settled s
  where s.outcome is not null and s.outcome <> 'void';
$$;

-------------------------------------------------------------------------------
-- The owner's takes
-------------------------------------------------------------------------------

create function public.add_hot_take(event uuid, question text, closes_at timestamptz default null,
                                    options jsonb default '["yes", "no"]')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if exists (select 1 from jsonb_array_elements(add_hot_take.options) o
             where jsonb_typeof(o) <> 'string' or char_length(o #>> '{}') not between 1 and 12) then
    raise exception 'options are 2 to 4 short words';
  end if;
  insert into public.community_polls (id, event_id, kind, slug, question, options, closes_at)
  values (new_id, event, 'hot_take', 'owner:' || new_id, add_hot_take.question, add_hot_take.options, add_hot_take.closes_at);
  return new_id;
end;
$$;

create function public.resolve_hot_take(poll uuid, answer text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if resolve_hot_take.answer <> 'void' and not exists (
    select 1 from public.community_polls p where p.id = poll and p.options ? resolve_hot_take.answer
  ) then
    raise exception '% is not an option for this take', resolve_hot_take.answer;
  end if;
  update public.community_polls p set answer = resolve_hot_take.answer where p.id = poll;
end;
$$;

create function public.delete_hot_take(poll uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.community_polls p where p.id = poll;
$$;

-------------------------------------------------------------------------------
-- Access and schedule
-------------------------------------------------------------------------------

revoke execute on function
  public.sidelined_players(), public.poll_close_at(uuid), public.poll_outcome(uuid), public.current_main_event(uuid),
  public.ensure_polls(uuid), public.ensure_community(), public.poll_payload(uuid, uuid, timestamptz),
  public.top_performers(uuid, uuid), public.league_card(uuid, uuid, uuid, text),
  public.community_card_at(uuid, uuid, timestamptz),
  public.add_hot_take(uuid, text, timestamptz, jsonb), public.resolve_hot_take(uuid, text), public.delete_hot_take(uuid),
  public.community_card(uuid), public.vote_poll(uuid, text), public.takes_record()
  from public, anon, authenticated;

grant execute on function public.community_card(uuid), public.vote_poll(uuid, text), public.takes_record()
  to authenticated;

select cron.schedule('community-polls', '*/10 * * * *', $$select public.ensure_community()$$);
