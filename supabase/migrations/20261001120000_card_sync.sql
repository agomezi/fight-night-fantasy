-- Fight-card sync.
--
-- The `sync-fight-cards` Edge Function reads every announced upcoming card and
-- hands each one to `sync_event_card`, which upserts it by UFC ids in a single
-- transaction. Running it twice with the same card changes nothing.
--
-- Events take their season slot when they lock, not when they are announced:
-- cards are cancelled, postponed and reshuffled weeks out, so slotting on
-- announcement would leave holes or renumber a season. `assign_season_slots`
-- runs after every sync and slots whatever has locked since.

-------------------------------------------------------------------------------
-- Schema adjustments
-------------------------------------------------------------------------------

-- UFC announces bouts weeks before it splits the card into main card and
-- prelims. Null means the split is not known yet.
alter table public.bouts alter column card_segment drop not null;

-- A cancelled bout keeps the slot it held, so its picks still read in context,
-- while the replacement bout UFC books into that slot needs it too. Only live
-- bouts compete for a position. Still deferrable, so a reorder can swap two
-- bouts within one transaction.
create extension if not exists btree_gist with schema extensions;

alter table public.bouts drop constraint bouts_event_id_fight_order_key;
alter table public.bouts add constraint bouts_scheduled_fight_order_excl
  exclude using gist (event_id with =, fight_order with =)
  where (status = 'scheduled')
  deferrable initially deferred;

-- Picks name a fighter, not a corner, so UFC swapping who stands in which
-- corner is not a substitution and must not void anyone's pick. Only a change
-- in who is fighting bumps the version.
create or replace function public.bump_bout_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if least(new.red_fighter_id, new.blue_fighter_id) is distinct from least(old.red_fighter_id, old.blue_fighter_id)
     or greatest(new.red_fighter_id, new.blue_fighter_id) is distinct from greatest(old.red_fighter_id, old.blue_fighter_id) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Writing a card
-------------------------------------------------------------------------------

-- Returns the fighter's id, creating them on first sight and keeping their
-- name current after that.
create function public.upsert_fighter(fighter jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  fighter_id uuid;
begin
  insert into public.fighters (ufc_fighter_id, name, nickname)
  values (fighter->>'ufcFighterId', fighter->>'name', fighter->>'nickname')
  on conflict (ufc_fighter_id) do update
    set name = excluded.name, nickname = excluded.nickname
    where (fighters.name, fighters.nickname) is distinct from (excluded.name, excluded.nickname)
  returning id into fighter_id;

  -- An unchanged fighter skips the update, and with it the returned row.
  if fighter_id is null then
    select id into fighter_id from public.fighters where ufc_fighter_id = fighter->>'ufcFighterId';
  end if;
  return fighter_id;
end;
$$;

-- `card` is the shape `parseCard` produces. Returns a summary of what changed.
create function public.sync_event_card(card jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  ev            public.events%rowtype;
  existing      public.bouts%rowtype;
  bout          jsonb;
  red_id        uuid;
  blue_id       uuid;
  card_starts   timestamptz := (card->>'startsAt')::timestamptz;
  seen          text[] := array[]::text[];
  n_added       integer := 0;
  n_changed     integer := 0;
  n_substituted integer := 0;
  n_reinstated  integer := 0;
  n_cancelled   integer := 0;
begin
  -- Every bout missing from the card is cancelled below, so an empty card
  -- would wipe the event. The parser never produces one; refuse it anyway.
  if jsonb_array_length(coalesce(card->'bouts', '[]')) = 0 then
    raise exception 'card for event % has no bouts', card->>'ufcEventId';
  end if;

  select * into ev from public.events where ufc_event_id = card->>'ufcEventId' for update;

  if not found then
    insert into public.events (ufc_event_id, name, starts_at, locks_at, status)
    values (card->>'ufcEventId', card->>'name', card_starts, card_starts, (card->>'status')::public.event_status)
    returning * into ev;
  elsif ev.status in ('complete', 'cancelled') then
    -- Finished or called off: results and corrections own it from here.
    return jsonb_build_object('event_id', ev.id, 'skipped', ev.status);
  else
    -- Once picks have locked, a late change to the start time must not
    -- reopen them, so the times freeze at lock.
    update public.events set
      name      = card->>'name',
      status    = (card->>'status')::public.event_status,
      starts_at = case when ev.locks_at > now() then card_starts else ev.starts_at end,
      locks_at  = case when ev.locks_at > now() then card_starts else ev.locks_at end
    where id = ev.id
      and (name, status, starts_at, locks_at) is distinct from (
        card->>'name',
        (card->>'status')::public.event_status,
        case when ev.locks_at > now() then card_starts else ev.starts_at end,
        case when ev.locks_at > now() then card_starts else ev.locks_at end
      );
  end if;

  for bout in select * from jsonb_array_elements(card->'bouts') loop
    red_id  := public.upsert_fighter(bout->'red');
    blue_id := public.upsert_fighter(bout->'blue');
    seen    := seen || (bout->>'ufcFightId');

    select * into existing from public.bouts where ufc_fight_id = bout->>'ufcFightId' for update;

    if not found then
      insert into public.bouts
        (ufc_fight_id, event_id, fight_order, card_segment, scheduled_rounds, weight_class,
         red_fighter_id, blue_fighter_id)
      values
        (bout->>'ufcFightId', ev.id, (bout->>'order')::smallint, (bout->>'segment')::public.card_segment,
         (bout->>'scheduledRounds')::smallint, bout->>'weightClass', red_id, blue_id);
      n_added := n_added + 1;
      continue;
    end if;

    -- Same bout id, different pair of fighters: a substitution. The version
    -- trigger bumps the bout, which voids picks made against the old pairing.
    if least(red_id, blue_id) <> least(existing.red_fighter_id, existing.blue_fighter_id)
       or greatest(red_id, blue_id) <> greatest(existing.red_fighter_id, existing.blue_fighter_id) then
      n_substituted := n_substituted + 1;
    end if;
    if existing.status = 'cancelled' then
      n_reinstated := n_reinstated + 1;
    end if;

    update public.bouts set
      event_id         = ev.id,
      fight_order      = (bout->>'order')::smallint,
      card_segment     = (bout->>'segment')::public.card_segment,
      scheduled_rounds = (bout->>'scheduledRounds')::smallint,
      weight_class     = bout->>'weightClass',
      red_fighter_id   = red_id,
      blue_fighter_id  = blue_id,
      status           = 'scheduled'
    where id = existing.id
      and (event_id, fight_order, card_segment, scheduled_rounds, weight_class,
           red_fighter_id, blue_fighter_id, status)
        is distinct from
          (ev.id, (bout->>'order')::smallint, (bout->>'segment')::public.card_segment,
           (bout->>'scheduledRounds')::smallint, bout->>'weightClass', red_id, blue_id,
           'scheduled'::public.bout_status);
    if found then
      n_changed := n_changed + 1;
    end if;
  end loop;

  -- A bout that has dropped off the card is cancelled. One snapshot cannot
  -- say why, but the previous sync is the other snapshot: the bout was on the
  -- card then and is not now. Bouts entered by hand have no UFC id and are
  -- left alone.
  update public.bouts set status = 'cancelled'
  where event_id = ev.id
    and status = 'scheduled'
    and ufc_fight_id is not null
    and ufc_fight_id <> all (seen);
  get diagnostics n_cancelled = row_count;

  return jsonb_build_object(
    'event_id',    ev.id,
    'added',       n_added,
    'changed',     n_changed,
    'substituted', n_substituted,
    'reinstated',  n_reinstated,
    'cancelled',   n_cancelled
  );
end;
$$;

-------------------------------------------------------------------------------
-- Season slots
-------------------------------------------------------------------------------

-- Gives every locked, unslotted event the next slot in the current season,
-- in lock order, and opens the next season when the current one has its
-- eleven. Returns how many events it slotted.
--
-- Season 1 is opened by hand at launch (a `seasons` row with `starts_at`);
-- until then nothing is slotted. Events that locked before the current season
-- began are pre-season and stay unslotted, so opening a season never sweeps up
-- cards that ran before it.
create function public.assign_season_slots()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  season   public.seasons%rowtype;
  ev       record;
  last_idx integer;
  slotted  integer := 0;
begin
  -- Two overlapping runs would hand out the same slot.
  perform pg_advisory_xact_lock(hashtext('public.assign_season_slots'));

  select * into season from public.seasons order by number desc limit 1;
  if not found or season.starts_at is null then
    return 0;
  end if;

  for ev in
    select id, locks_at from public.events
    where season_id is null
      and status <> 'cancelled'
      and locks_at <= now()
      and locks_at >= season.starts_at
    order by locks_at, id
  loop
    select coalesce(max(season_index), 0) into last_idx
    from public.events where season_id = season.id;

    if last_idx >= 11 then
      insert into public.seasons (number, starts_at)
      values (season.number + 1, ev.locks_at)
      returning * into season;
      last_idx := 0;
    end if;

    update public.events set season_id = season.id, season_index = last_idx + 1
    where id = ev.id;
    slotted := slotted + 1;
  end loop;

  return slotted;
end;
$$;

-------------------------------------------------------------------------------
-- Access: ingestion only
-------------------------------------------------------------------------------

revoke execute on function public.upsert_fighter(jsonb) from public, anon, authenticated;
revoke execute on function public.sync_event_card(jsonb) from public, anon, authenticated;
revoke execute on function public.assign_season_slots() from public, anon, authenticated;
grant execute on function public.upsert_fighter(jsonb) to service_role;
grant execute on function public.sync_event_card(jsonb) to service_role;
grant execute on function public.assign_season_slots() to service_role;

-------------------------------------------------------------------------------
-- Schedule
-------------------------------------------------------------------------------

-- A full sync daily, which discovers newly announced cards, and a quick pass
-- every 15 minutes over cards within a week of starting, which is when
-- withdrawals and substitutions land. The project URL and the function's
-- shared secret come from Vault at run time, so neither is in the repo; where
-- they are not set (a local stack) the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.invoke_card_sync(mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'card_sync_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/sync-fight-cards',
    headers := jsonb_build_object('content-type', 'application/json', 'x-card-sync-secret', secret),
    body    := jsonb_build_object('mode', mode),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.invoke_card_sync(text) from public, anon, authenticated;

select cron.schedule('card-sync-full', '0 9 * * *', $$select public.invoke_card_sync('full')$$);
select cron.schedule('card-sync-soon', '*/15 * * * *', $$select public.invoke_card_sync('soon')$$);
