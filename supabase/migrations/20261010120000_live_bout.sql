-- The fight in the cage.
--
-- The feed says which bout is live, from walkout until its result is in. The
-- results sync now keeps that on the event, so the app can mark the fight
-- happening right now. It clears between fights and when the card ends.

alter table public.events add column live_bout_id uuid references public.bouts (id) on delete set null;

create or replace function public.record_event_results(card jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  ev        public.events%rowtype;
  bout      jsonb;
  res       jsonb;
  b         public.bouts%rowtype;
  winner_id uuid;
  n_written integer := 0;
  unknown   text[] := array[]::text[];
  w         integer;
begin
  select * into ev from public.events where ufc_event_id = card->>'ufcEventId' for update;
  if not found then
    raise exception 'event % is not stored', card->>'ufcEventId';
  end if;

  -- The card sync also sets this, but only every 15 minutes.
  if ev.status <> 'cancelled' then
    update public.events set status = (card->>'status')::public.event_status
    where id = ev.id and status is distinct from (card->>'status')::public.event_status;
  end if;

  -- The bout in the cage, from walkout to result; null between fights.
  update public.events set live_bout_id = (
    select b2.id from public.bouts b2 where b2.event_id = ev.id and b2.ufc_fight_id = card->>'liveFightId'
  )
  where id = ev.id and live_bout_id is distinct from (
    select b2.id from public.bouts b2 where b2.event_id = ev.id and b2.ufc_fight_id = card->>'liveFightId'
  );

  for bout in select * from jsonb_array_elements(card->'bouts') loop
    res := bout->'result';
    if res is null or jsonb_typeof(res) = 'null' then
      continue;
    end if;

    select * into b from public.bouts where ufc_fight_id = bout->>'ufcFightId' and event_id = ev.id;
    if not found then
      -- Not synced yet; the card sync will add it and the next poll writes it.
      unknown := unknown || (bout->>'ufcFightId');
      continue;
    end if;

    winner_id := null;
    if res->>'winnerUfcFighterId' is not null then
      select id into winner_id from public.fighters where ufc_fighter_id = res->>'winnerUfcFighterId';
      if winner_id is null then
        unknown := unknown || (bout->>'ufcFightId');
        continue;
      end if;
    end if;

    insert into public.results as r
      (bout_id, status, winner_fighter_id, method, round, time, void_reason, source, raw)
    values (
      b.id,
      case when (res->>'final')::boolean then 'final' else 'provisional' end::public.result_status,
      winner_id,
      (res->>'method')::public.result_method,
      (res->>'round')::smallint,
      res->>'time',
      (res->>'voidReason')::public.void_reason,
      'ufc_live',
      res->'raw'
    )
    on conflict (bout_id) do update set
      status            = excluded.status,
      winner_fighter_id = excluded.winner_fighter_id,
      method            = excluded.method,
      round             = excluded.round,
      time              = excluded.time,
      void_reason       = excluded.void_reason,
      source            = excluded.source,
      raw               = excluded.raw
    where (r.status, r.winner_fighter_id, r.method, r.round, r.time, r.void_reason)
      is distinct from
          (excluded.status, excluded.winner_fighter_id, excluded.method, excluded.round,
           excluded.time, excluded.void_reason);
    get diagnostics w = row_count;
    n_written := n_written + w;
  end loop;

  return jsonb_build_object('event_id', ev.id, 'written', n_written, 'unknown', to_jsonb(unknown));
end;
$$;
