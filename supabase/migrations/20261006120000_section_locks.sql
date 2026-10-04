-- Picks lock by section.
--
-- A card used to lock all at once when its first bout started, which closed
-- the main card hours before it began. Each bout now locks when its own part
-- of the card starts: early prelims at theirs, prelims at theirs, the main
-- card at its own. A bout can be picked right up until its section begins,
-- and never after.
--
-- `events.locks_at` stays the earliest lock: it still marks when the card has
-- started, which is what season slots and history go by. A bout with no lock
-- of its own (entered by hand) falls back to it.

alter table public.bouts add column locks_at timestamptz;

-- Bouts already stored take their event's lock; the next card sync, within 15
-- minutes for anything in the coming week, replaces it with the section's.
update public.bouts b set locks_at = e.locks_at from public.events e where e.id = b.event_id;

-------------------------------------------------------------------------------
-- The card sync writes each bout's lock
-------------------------------------------------------------------------------

-- `card` is the shape `parseCard` produces, whose bouts now carry `locksAt`.
create or replace function public.sync_event_card(card jsonb)
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
  bout_locks    timestamptz;
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
    bout_locks := coalesce((bout->>'locksAt')::timestamptz, card_starts);

    select * into existing from public.bouts where ufc_fight_id = bout->>'ufcFightId' for update;

    if not found then
      insert into public.bouts
        (ufc_fight_id, event_id, fight_order, card_segment, scheduled_rounds, weight_class,
         red_fighter_id, blue_fighter_id, locks_at)
      values
        (bout->>'ufcFightId', ev.id, (bout->>'order')::smallint, (bout->>'segment')::public.card_segment,
         (bout->>'scheduledRounds')::smallint, bout->>'weightClass', red_id, blue_id, bout_locks);
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
      status           = 'scheduled',
      -- Once a bout has locked, a late change to its start must not reopen it.
      locks_at         = case when existing.locks_at is null or existing.locks_at > now()
                              then bout_locks else existing.locks_at end
    where id = existing.id
      and (event_id, fight_order, card_segment, scheduled_rounds, weight_class,
           red_fighter_id, blue_fighter_id, status, locks_at)
        is distinct from
          (ev.id, (bout->>'order')::smallint, (bout->>'segment')::public.card_segment,
           (bout->>'scheduledRounds')::smallint, bout->>'weightClass', red_id, blue_id,
           'scheduled'::public.bout_status,
           case when existing.locks_at is null or existing.locks_at > now()
                then bout_locks else existing.locks_at end);
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
-- The pick lock goes by the bout
-------------------------------------------------------------------------------

create or replace function public.enforce_pick_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bout_ids uuid[];
  closed   boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  -- Someone else's pick is row-level security's to refuse, which happens after
  -- this trigger; answering "locked" first would misreport it.
  if coalesce(new.user_id, old.user_id) is distinct from (select auth.uid()) then
    return coalesce(new, old);
  end if;

  -- An update is checked against both bouts, so a pick cannot be moved out of
  -- a locked event any more than into one.
  bout_ids := case tg_op
    when 'INSERT' then array[new.bout_id]
    when 'DELETE' then array[old.bout_id]
    else array[old.bout_id, new.bout_id]
  end;

  select bool_or(coalesce(b.locks_at, e.locks_at) <= now()) into closed
  from public.bouts b
  join public.events e on e.id = b.event_id
  where b.id = any (bout_ids);

  if closed then
    raise exception 'picks are locked for this event'
      using errcode = 'P0001', hint = 'locked';
  end if;

  if tg_op <> 'DELETE'
     and exists (select 1 from public.bouts where id = new.bout_id and status = 'cancelled') then
    raise exception 'bout % is cancelled', new.bout_id
      using errcode = 'P0001', hint = 'cancelled';
  end if;

  return coalesce(new, old);
end;
$$;
