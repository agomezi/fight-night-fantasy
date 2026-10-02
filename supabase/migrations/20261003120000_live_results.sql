-- Live results.
--
-- The `sync-results` Edge Function polls the UFC stats feed while a card is
-- on, writes each bout's result through `record_event_results`, re-scores the
-- whole card and replaces its scores through `replace_event_scores`. Running
-- it twice with the same feed changes nothing.
--
-- Polling is adaptive. Each event carries the time it is next due, which the
-- function sets after every poll: often while a fight is on, less often
-- between fights, and once every few hours for a week after the card so a
-- result overturned days later is still picked up.

-------------------------------------------------------------------------------
-- Schema adjustments
-------------------------------------------------------------------------------

-- When the results sync should next read this event. Null means it has not
-- been polled yet, so it is due as soon as its window opens.
alter table public.events add column results_due_at timestamptz;

-- A score against a result the feed may still correct. The app shows these
-- as provisional; they settle when the result is marked final.
alter table public.scores add column provisional boolean not null default false;

-------------------------------------------------------------------------------
-- Writing results
-------------------------------------------------------------------------------

-- `card` is the shape `parseResults` produces. Writes a result for every bout
-- that has one, and only where it differs from what is stored, so an
-- unchanged poll writes nothing and adds no revision. Manually set results
-- are left alone by `guard_result`. Bouts with no result are never cleared:
-- absence from the feed is not evidence that a result was withdrawn.
create function public.record_event_results(card jsonb)
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

-------------------------------------------------------------------------------
-- Writing scores
-------------------------------------------------------------------------------

-- Replaces every score on the event's bouts with `score_rows`, the shape
-- `scoreEvent` produces. Rows that did not change are left untouched, so
-- `computed_at` records when a score last moved. A score with no row any
-- more (a pick deleted before lock, a result withdrawn by hand) is removed.
create function public.replace_event_scores(event_id uuid, score_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  season    uuid;
  n_written integer;
  n_removed integer;
begin
  select e.season_id into season from public.events e where e.id = event_id;
  if not found then
    raise exception 'event % is not stored', event_id;
  end if;

  create temporary table incoming on commit drop as
  select
    (x->>'user_id')::uuid             as user_id,
    (x->>'bout_id')::uuid             as bout_id,
    (x->>'points')::integer           as points,
    x->'breakdown'                    as breakdown,
    (x->>'correct')::boolean          as correct,
    (x->>'counts_for_accuracy')::boolean as counts_for_accuracy,
    (x->>'provisional')::boolean      as provisional
  from jsonb_array_elements(score_rows) x;

  if exists (
    select 1 from incoming i
    left join public.bouts b on b.id = i.bout_id
    where b.event_id is distinct from replace_event_scores.event_id
  ) then
    raise exception 'scores include bouts outside event %', event_id;
  end if;

  delete from public.scores s
  using public.bouts b
  where b.id = s.bout_id
    and b.event_id = replace_event_scores.event_id
    and not exists (select 1 from incoming i where i.user_id = s.user_id and i.bout_id = s.bout_id);
  get diagnostics n_removed = row_count;

  insert into public.scores as s
    (user_id, bout_id, season_id, points, breakdown, correct, counts_for_accuracy, provisional)
  select user_id, bout_id, season, points, breakdown, correct, counts_for_accuracy, provisional
  from incoming
  on conflict (user_id, bout_id) do update set
    season_id           = excluded.season_id,
    points              = excluded.points,
    breakdown           = excluded.breakdown,
    correct             = excluded.correct,
    counts_for_accuracy = excluded.counts_for_accuracy,
    provisional         = excluded.provisional,
    computed_at         = now()
  where (s.season_id, s.points, s.breakdown, s.correct, s.counts_for_accuracy, s.provisional)
    is distinct from
        (excluded.season_id, excluded.points, excluded.breakdown, excluded.correct,
         excluded.counts_for_accuracy, excluded.provisional);
  get diagnostics n_written = row_count;

  drop table incoming;
  return jsonb_build_object('written', n_written, 'removed', n_removed);
end;
$$;

-------------------------------------------------------------------------------
-- What is due
-------------------------------------------------------------------------------

-- Events the results sync should read now: from 15 minutes before the card
-- until a week after it, whenever their due time has passed. The week covers
-- results overturned after the night.
create function public.events_due_for_results()
returns table (id uuid, ufc_event_id text)
language sql
stable
set search_path = ''
as $$
  select e.id, e.ufc_event_id from public.events e
  where e.ufc_event_id is not null
    and e.status <> 'cancelled'
    and e.starts_at <= now() + interval '15 minutes'
    and e.starts_at >= now() - interval '7 days'
    and (e.results_due_at is null or e.results_due_at <= now())
  order by e.starts_at;
$$;

create function public.set_results_due(event_id uuid, due_at timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.events set results_due_at = due_at where id = event_id;
$$;

-------------------------------------------------------------------------------
-- Access: ingestion only
-------------------------------------------------------------------------------

revoke execute on function public.record_event_results(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_event_scores(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.events_due_for_results() from public, anon, authenticated;
revoke execute on function public.set_results_due(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_event_results(jsonb) to service_role;
grant execute on function public.replace_event_scores(uuid, jsonb) to service_role;
grant execute on function public.events_due_for_results() to service_role;
grant execute on function public.set_results_due(uuid, timestamptz) to service_role;

-- These run with the caller's privileges, and the hosted project grants new
-- tables to nobody, so service_role gets exactly what the sync touches.
revoke all on public.results, public.scores, public.picks from service_role;
grant select, insert, update on public.results to service_role;
grant select, insert, update, delete on public.scores to service_role;
grant select on public.picks to service_role;
-- result_revisions is written by a trigger that runs as the caller, so the
-- insert needs granting too.
grant insert on public.result_revisions to service_role;

-------------------------------------------------------------------------------
-- Schedule
-------------------------------------------------------------------------------

-- Checked every 30 seconds, but the function is only called when an event is
-- actually due, so outside a card's window this costs one cheap query. Uses
-- the card sync's Vault secrets; without them (a local stack) it does nothing.
create function public.invoke_results_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  if not exists (select 1 from public.events_due_for_results()) then
    return;
  end if;

  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'card_sync_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/sync-results',
    headers := jsonb_build_object('content-type', 'application/json', 'x-card-sync-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.invoke_results_sync() from public, anon, authenticated;

select cron.schedule('results-sync', '30 seconds', $$select public.invoke_results_sync()$$);
