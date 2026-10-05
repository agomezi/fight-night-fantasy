-- Bout odds and the underdog snapshot.
--
-- Scoring has always applied the 1.5x underdog bonus from
-- `bouts.underdog_corner`, but nothing wrote it. The odds sync now stores a
-- consensus moneyline for each bout and sets the underdog from it: the corner
-- the books give the lower chance, with no underdog when the two are level.
--
-- Odds keep moving until a bout locks, and so does its underdog. At the lock
-- they freeze: the underdog people saw when they picked is the one that is
-- scored, every pick on the bout gets the same multiplier, and scoring stays
-- reproducible after the line moves. A fighter swap before the lock clears
-- the old pairing's odds until the next sync prices the new one.

alter table public.bouts
  add column red_odds        integer check (abs(red_odds) >= 100),
  add column blue_odds       integer check (abs(blue_odds) >= 100),
  add column odds_updated_at timestamptz,
  add check ((red_odds is null) = (blue_odds is null));

-------------------------------------------------------------------------------
-- The underdog, and its freeze at the lock
-------------------------------------------------------------------------------

-- The chance an American price implies, bookmaker margin included.
create function public.implied_probability(american integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when american > 0 then 100.0 / (american + 100) else -american / (-american + 100.0) end
$$;

create function public.underdog_of(red_odds integer, blue_odds integer)
returns public.corner
language sql
immutable
set search_path = ''
as $$
  select case
    when public.implied_probability(red_odds) < public.implied_probability(blue_odds) then 'red'::public.corner
    when public.implied_probability(blue_odds) < public.implied_probability(red_odds) then 'blue'::public.corner
  end
$$;

create function public.guard_bout_odds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  locked_at timestamptz := coalesce(old.locks_at, (select locks_at from public.events where id = old.event_id));
begin
  if (new.red_odds, new.blue_odds, new.underdog_corner) is not distinct from (old.red_odds, old.blue_odds, old.underdog_corner)
     and new.red_fighter_id = old.red_fighter_id and new.blue_fighter_id = old.blue_fighter_id then
    return new;
  end if;

  if locked_at <= now() then
    if (new.red_odds, new.blue_odds, new.underdog_corner) is distinct from (old.red_odds, old.blue_odds, old.underdog_corner) then
      raise exception 'bout % has locked; its odds and underdog are final', old.id;
    end if;
    return new;
  end if;

  -- New fighters before the lock: the old pairing's price says nothing about them.
  if new.red_fighter_id <> old.red_fighter_id or new.blue_fighter_id <> old.blue_fighter_id then
    new.red_odds        := null;
    new.blue_odds       := null;
    new.odds_updated_at := null;
    new.underdog_corner := null;
  end if;
  return new;
end;
$$;

create trigger bouts_guard_odds before update on public.bouts
  for each row execute function public.guard_bout_odds();

-------------------------------------------------------------------------------
-- The odds sync's reads and writes
-------------------------------------------------------------------------------

-- One row per odds sync run, kept to space runs out and to watch the monthly
-- request quota. Internal: no client role can read it.
create table public.odds_syncs (
  id                bigint generated always as identity primary key,
  ran_at            timestamptz not null default now(),
  credits_remaining integer,
  report            jsonb not null default '{}'::jsonb
);

alter table public.odds_syncs enable row level security;

-- Revoke first so a local stack, which grants everything by default, matches
-- the hosted project, which grants nothing.
revoke all on public.odds_syncs from anon, authenticated, service_role;
grant select, insert on public.odds_syncs to service_role;

-- Bouts still open to picks on cards in the next two weeks, with the names
-- the odds are matched on.
create function public.bouts_for_odds()
returns table (bout_id uuid, starts_at timestamptz, red text, blue text)
language sql
stable
set search_path = ''
as $$
  select b.id, e.starts_at, r.name, bl.name
  from public.bouts b
  join public.events e on e.id = b.event_id
  join public.fighters r on r.id = b.red_fighter_id
  join public.fighters bl on bl.id = b.blue_fighter_id
  where b.status = 'scheduled'
    and e.status in ('scheduled', 'live')
    and coalesce(b.locks_at, e.locks_at) > now()
    and coalesce(b.locks_at, e.locks_at) < now() + interval '14 days'
  order by e.starts_at, b.fight_order
$$;

-- `odds` is the shape `matchOdds` produces. Bouts that have locked are
-- skipped, so a late run can never move a frozen underdog. Every run is
-- logged, including one that matched nothing, so a failing source is not
-- retried every few minutes.
create function public.record_odds(odds jsonb, report jsonb, credits_remaining integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n_updated integer;
begin
  update public.bouts b set
    red_odds        = o."redOdds",
    blue_odds       = o."blueOdds",
    odds_updated_at = now(),
    underdog_corner = public.underdog_of(o."redOdds", o."blueOdds")
  from jsonb_to_recordset(coalesce(odds, '[]'::jsonb)) as o("boutId" uuid, "redOdds" integer, "blueOdds" integer),
       public.events e
  where b.id = o."boutId"
    and e.id = b.event_id
    and b.status = 'scheduled'
    and coalesce(b.locks_at, e.locks_at) > now();
  get diagnostics n_updated = row_count;

  insert into public.odds_syncs (credits_remaining, report)
  values (credits_remaining, coalesce(report, '{}'::jsonb) || jsonb_build_object('updated', n_updated));
  return n_updated;
end;
$$;

revoke execute on function public.bouts_for_odds(), public.record_odds(jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.bouts_for_odds(), public.record_odds(jsonb, jsonb, integer) to service_role;

-------------------------------------------------------------------------------
-- Schedule
-------------------------------------------------------------------------------

-- The free plan allows 500 requests a month and one request prices every
-- card. Runs are spaced 6 hours apart, 2 hours in the day before a lock, plus
-- one in the 20 minutes before each section locks, so the frozen underdog is
-- a fresh price. That is roughly 200 requests in a month of weekly cards.
create function public.odds_sync_due()
returns boolean
language sql
stable
set search_path = ''
as $$
  with next as (
    select min(coalesce(b.locks_at, e.locks_at)) as lock_at
    from public.bouts b
    join public.events e on e.id = b.event_id
    where b.status = 'scheduled'
      and e.status in ('scheduled', 'live')
      and coalesce(b.locks_at, e.locks_at) > now()
      and coalesce(b.locks_at, e.locks_at) < now() + interval '14 days'
  ), last as (
    select max(ran_at) as ran_at from public.odds_syncs
  )
  select next.lock_at is not null and (
    last.ran_at is null
    or last.ran_at < now() - case when next.lock_at < now() + interval '24 hours'
                                  then interval '2 hours' else interval '6 hours' end
    or (next.lock_at <= now() + interval '20 minutes' and last.ran_at < next.lock_at - interval '20 minutes')
  )
  from next, last
$$;

revoke execute on function public.odds_sync_due() from public, anon, authenticated;

-- Uses the card sync's Vault secrets; without them (a local stack) it does nothing.
create function public.invoke_odds_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  if not public.odds_sync_due() then
    return;
  end if;

  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'card_sync_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/sync-odds',
    headers := jsonb_build_object('content-type', 'application/json', 'x-card-sync-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.invoke_odds_sync() from public, anon, authenticated;

select cron.schedule('odds-sync', '*/5 * * * *', $$select public.invoke_odds_sync()$$);
