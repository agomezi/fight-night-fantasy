-- Each fighter's UFC history: wins by method and their current win streak.
--
-- The card feed has a fighter's record but not how they won. So the history
-- up to some date is loaded once, from an offline fight table, by
-- scripts/load-fighter-stats.ts, and every fight after that date is counted
-- from our own results as they come in. Nothing needs reloading week to week;
-- a reload only refreshes or corrects the history.
--
-- The loaded history is keyed by name, since its source has no UFC fighter
-- ids, so a fighter added by card sync later still finds theirs.

create extension if not exists unaccent with schema extensions;

-- "Jiří Procházka" and "Jiri Prochazka" alike: "jiriprochazka".
create function public.fighter_name_key(name text)
returns text
language sql
stable
set search_path = ''
as $$
  select regexp_replace(lower(extensions.unaccent(name)), '[^a-z]', '', 'g');
$$;

-------------------------------------------------------------------------------
-- The loaded history
-------------------------------------------------------------------------------

create table public.fighter_ufc_stats (
  name_key   text primary key,
  wins       smallint not null check (wins >= 0),
  losses     smallint not null check (losses >= 0),
  ko_wins    smallint not null check (ko_wins >= 0),
  sub_wins   smallint not null check (sub_wins >= 0),
  dec_wins   smallint not null check (dec_wins >= 0),
  win_streak smallint not null check (win_streak >= 0),
  last_fight date not null,
  -- The date the source runs to. Our own results count from the day after.
  as_of      date not null
);

alter table public.fighter_ufc_stats enable row level security;
create policy "reference data is public" on public.fighter_ufc_stats for select using (true);
revoke insert, update, delete, truncate on public.fighter_ufc_stats from anon, authenticated;

-- Replaces every stored history with `stats`, a list of
-- { name, wins, losses, koWins, subWins, decWins, winStreak, lastFight }.
-- Two fighters whose names match keep the one who fought last. Reports how
-- many fighters on upcoming cards were found, and who wasn't.
create function public.load_fighter_stats(stats jsonb, as_of date)
returns table (loaded integer, upcoming integer, matched integer, unmatched text[])
language plpgsql
set search_path = ''
as $$
begin
  delete from public.fighter_ufc_stats where true;
  insert into public.fighter_ufc_stats
    (name_key, wins, losses, ko_wins, sub_wins, dec_wins, win_streak, last_fight, as_of)
  select distinct on (public.fighter_name_key(s->>'name'))
    public.fighter_name_key(s->>'name'),
    (s->>'wins')::smallint, (s->>'losses')::smallint,
    (s->>'koWins')::smallint, (s->>'subWins')::smallint, (s->>'decWins')::smallint,
    (s->>'winStreak')::smallint, (s->>'lastFight')::date, load_fighter_stats.as_of
  from jsonb_array_elements(stats) s
  where public.fighter_name_key(s->>'name') <> ''
  order by public.fighter_name_key(s->>'name'), (s->>'lastFight')::date desc;

  return query
  with upcoming as (
    select distinct f.id, f.name
    from public.events e
    join public.bouts b on b.event_id = e.id
    join public.fighters f on f.id in (b.red_fighter_id, b.blue_fighter_id)
    where e.status in ('scheduled', 'live')
  )
  select (select count(*)::integer from public.fighter_ufc_stats),
         (select count(*)::integer from upcoming),
         (select count(*)::integer from upcoming u
          where exists (select 1 from public.fighter_ufc_stats s where s.name_key = public.fighter_name_key(u.name))),
         array(select u.name from upcoming u
               where not exists (select 1 from public.fighter_ufc_stats s where s.name_key = public.fighter_name_key(u.name))
               order by u.name);
end;
$$;

revoke execute on function public.load_fighter_stats(jsonb, date) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Up to date
-------------------------------------------------------------------------------

-- A fighter's UFC history as it stands: the loaded history plus every result
-- of ours since. Embeddable as `ufc_stats` wherever fighters are read; no row
-- when there's neither.
--
-- A no contest counts for no one and doesn't end a streak; a draw ends it.
-- Cards are dated by their day in New York, as the UFC lists them.
create function public.ufc_stats(fighter public.fighters)
returns setof public.fighter_ufc_stats
rows 1
language plpgsql
stable
set search_path = ''
as $$
declare
  base   public.fighter_ufc_stats%rowtype;
  cutoff date;
  fight  record;
  wins   integer := 0;
  losses integer := 0;
  ko     integer := 0;
  sub    integer := 0;
  dec    integer := 0;
  streak integer := 0;
  broken boolean := false;
  latest date;
begin
  select * into base from public.fighter_ufc_stats s where s.name_key = public.fighter_name_key(fighter.name);
  -- Someone the history doesn't know still only counts fights after it, so a
  -- name that didn't match is never counted twice.
  cutoff := coalesce(base.as_of, (select max(s.as_of) from public.fighter_ufc_stats s), '-infinity'::date);

  -- Newest first, for the streak.
  for fight in
    select (e.starts_at at time zone 'America/New_York')::date as day,
           r.void_reason, r.method, r.winner_fighter_id = fighter.id as won
    from public.bouts b
    join public.events e on e.id = b.event_id
    join public.results r on r.bout_id = b.id
    where fighter.id in (b.red_fighter_id, b.blue_fighter_id)
      and (e.starts_at at time zone 'America/New_York')::date > cutoff
      and r.void_reason is distinct from 'CANCELLED'
      and r.void_reason is distinct from 'FIGHTER_CHANGED'
    order by e.starts_at desc
  loop
    latest := greatest(latest, fight.day);
    continue when fight.void_reason = 'NC';
    if fight.won then
      wins := wins + 1;
      ko := ko + (fight.method = 'KO')::integer;
      sub := sub + (fight.method = 'SUB')::integer;
      dec := dec + (fight.method = 'DEC')::integer;
      if not broken then
        streak := streak + 1;
      end if;
    else
      losses := losses + (fight.void_reason is null)::integer;
      broken := true;
    end if;
  end loop;

  if base.name_key is null and latest is null then
    return;
  end if;

  return next row(
    coalesce(base.name_key, public.fighter_name_key(fighter.name)),
    coalesce(base.wins, 0) + wins,
    coalesce(base.losses, 0) + losses,
    coalesce(base.ko_wins, 0) + ko,
    coalesce(base.sub_wins, 0) + sub,
    coalesce(base.dec_wins, 0) + dec,
    case when broken then streak else coalesce(base.win_streak, 0) + streak end,
    greatest(base.last_fight, latest),
    greatest(base.as_of, latest)
  )::public.fighter_ufc_stats;
end;
$$;
