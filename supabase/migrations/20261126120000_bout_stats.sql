-- Live fight stats.
--
-- The results sync reads each fight's stats file from the UFC feed (sig
-- strikes, takedowns, knockdowns, control time, round by round) while it is in
-- the cage, and again after the result until the feed marks the numbers
-- official. One row per bout, the parsed stats as they came, rewritten only
-- when they change. The app reads them through bout_stats(), with corners
-- lined up to our bout, so it never calls the feed itself.

create table public.bout_stats (
  bout_id    uuid primary key references public.bouts (id) on delete cascade,
  official   boolean not null default false,
  -- services/ingestion/fightStats.ts FightStats: red and blue as the feed has
  -- them, each with its UFC fighter id.
  stats      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bout_stats enable row level security;
revoke all on public.bout_stats from anon, authenticated, service_role;
-- The sync's functions run with its privileges, and the hosted project grants
-- new tables to nobody.
grant select, insert, update on public.bout_stats to service_role;

-------------------------------------------------------------------------------
-- Writes (results sync)
-------------------------------------------------------------------------------

-- Stores one fight's stats; true when anything changed. Official numbers are
-- never replaced by unofficial ones, in case the feed steps backwards.
create function public.record_bout_stats(stats jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  target uuid;
  n      integer;
begin
  select b.id into target from public.bouts b where b.ufc_fight_id = stats->>'ufcFightId';
  if target is null then
    return false;
  end if;

  insert into public.bout_stats as s (bout_id, official, stats)
  values (target, coalesce((stats->>'official')::boolean, false), stats)
  on conflict on constraint bout_stats_pkey do update set
    official   = excluded.official,
    stats      = excluded.stats,
    updated_at = now()
  where s.stats is distinct from excluded.stats
    and (excluded.official or not s.official);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Which fights' stats the sync should read for an event: the one in the cage,
-- then up to four that have a result but no official stats yet, newest card
-- first. Stops trying three days after the card, so a fight the feed never
-- finalises isn't read forever.
create function public.stats_due(event uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(ufc_fight_id order by live desc, fight_order), array[]::text[])
  from (
    select b.ufc_fight_id, b.fight_order, true as live
    from public.events e join public.bouts b on b.id = e.live_bout_id
    where e.id = event and b.ufc_fight_id is not null
    union
    (select b.ufc_fight_id, b.fight_order, false
    from public.bouts b
    join public.events e on e.id = b.event_id
    join public.results r on r.bout_id = b.id
    left join public.bout_stats s on s.bout_id = b.id
    where b.event_id = event
      and b.ufc_fight_id is not null
      and b.id is distinct from e.live_bout_id
      and e.starts_at > now() - interval '3 days'
      and r.void_reason is distinct from 'CANCELLED'
      and r.void_reason is distinct from 'FIGHTER_CHANGED'
      and not coalesce(s.official, false)
    order by b.fight_order
    limit 4)
  ) due;
$$;

-------------------------------------------------------------------------------
-- Reads (app)
-------------------------------------------------------------------------------

-- One bout's stats with red and blue as our bout has them, or null when there
-- are none or they belong to a different pairing (a late replacement).
--   { official, updatedAt, live, round, clock, red, blue, rounds: [{ round, red, blue }] }
-- `live`, `round` and `clock` are set only while the bout is in the cage.
create function public.bout_stats(bout uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s       public.bout_stats%rowtype;
  red_id  text;
  blue_id text;
  flip    boolean;
  is_live boolean;
begin
  select * into s from public.bout_stats where bout_id = bout;
  if not found then
    return null;
  end if;

  select fr.ufc_fighter_id, fb.ufc_fighter_id, e.live_bout_id is not distinct from b.id
    into red_id, blue_id, is_live
  from public.bouts b
  join public.events e on e.id = b.event_id
  join public.fighters fr on fr.id = b.red_fighter_id
  join public.fighters fb on fb.id = b.blue_fighter_id
  where b.id = bout;

  if red_id = s.stats->'red'->>'ufcFighterId' and blue_id = s.stats->'blue'->>'ufcFighterId' then
    flip := false;
  elsif red_id = s.stats->'blue'->>'ufcFighterId' and blue_id = s.stats->'red'->>'ufcFighterId' then
    flip := true;
  else
    return null;
  end if;

  return jsonb_build_object(
    'official', s.official,
    'updatedAt', s.updated_at,
    'live', is_live,
    'round', case when is_live then s.stats->'liveRound' else null end,
    'clock', case when is_live then s.stats->'liveClock' else null end,
    'red', s.stats->(case when flip then 'blue' else 'red' end),
    'blue', s.stats->(case when flip then 'red' else 'blue' end),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
          'round', r->'round',
          'red', r->(case when flip then 'blue' else 'red' end),
          'blue', r->(case when flip then 'red' else 'blue' end))
        order by (r->>'round')::integer)
      from jsonb_array_elements(s.stats->'rounds') r
    ), '[]'::jsonb)
  );
end;
$$;

-- Which of an event's bouts have stats to show, so the event screen offers
-- them only where there is something to open. Same pairing check as
-- bout_stats().
create function public.stats_bouts(event uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), array[]::uuid[])
  from public.bouts b
  join public.bout_stats s on s.bout_id = b.id
  join public.fighters fr on fr.id = b.red_fighter_id
  join public.fighters fb on fb.id = b.blue_fighter_id
  where b.event_id = event
    and (fr.ufc_fighter_id, fb.ufc_fighter_id) in (
      (s.stats->'red'->>'ufcFighterId', s.stats->'blue'->>'ufcFighterId'),
      (s.stats->'blue'->>'ufcFighterId', s.stats->'red'->>'ufcFighterId'));
$$;

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

revoke execute on function public.record_bout_stats(jsonb), public.stats_due(uuid), public.bout_stats(uuid),
  public.stats_bouts(uuid)
  from public, anon, authenticated;

grant execute on function public.record_bout_stats(jsonb), public.stats_due(uuid) to service_role;
grant execute on function public.bout_stats(uuid), public.stats_bouts(uuid) to authenticated;
