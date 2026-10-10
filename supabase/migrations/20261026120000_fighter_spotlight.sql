-- Fighter Spotlight on home.
--
-- Home spotlights the main event's two fighters. Setting this column, by hand
-- in the dashboard, puts another fighter on the card first instead, with
-- their opponent second. A fighter who isn't on the card is ignored, so a
-- stale choice falls back to the main event. Card sync never touches it.

alter table public.events
  add column spotlight_fighter_id uuid references public.fighters (id) on delete set null;

-------------------------------------------------------------------------------
-- UFC history: finishes and win streaks
-------------------------------------------------------------------------------

-- The card feed has a fighter's record but not how they won, so each UFC
-- fighter's history is summed up offline and loaded here by
-- scripts/load-fighter-stats.ts. It's keyed by name, since the source has no
-- UFC fighter ids, so a fighter added by card sync later still finds theirs.

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

create table public.fighter_ufc_stats (
  name_key   text primary key,
  wins       smallint not null check (wins >= 0),
  losses     smallint not null check (losses >= 0),
  ko_wins    smallint not null check (ko_wins >= 0),
  sub_wins   smallint not null check (sub_wins >= 0),
  dec_wins   smallint not null check (dec_wins >= 0),
  win_streak smallint not null check (win_streak >= 0),
  last_fight date not null,
  -- The date the source runs to.
  as_of      date not null
);

alter table public.fighter_ufc_stats enable row level security;
create policy "reference data is public" on public.fighter_ufc_stats for select using (true);
revoke insert, update, delete, truncate on public.fighter_ufc_stats from anon, authenticated;

-- A fighter's UFC history, embeddable as `ufc_stats` wherever fighters are
-- read.
create function public.ufc_stats(public.fighters)
returns setof public.fighter_ufc_stats
rows 1
language sql
stable
set search_path = ''
as $$
  select * from public.fighter_ufc_stats s where s.name_key = public.fighter_name_key($1.name);
$$;

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
