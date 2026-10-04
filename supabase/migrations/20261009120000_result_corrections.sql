-- Correcting results by hand.
--
-- The feed is right almost always, but not always: a result overturned weeks
-- later, a bout the feed never settles, a ruling we make differently. These
-- tools are for the owner, run from the SQL editor:
--
--   select * from recent_bouts;                          find the bout
--   select correct_result('<bout id>', 'Hernandez', 'KO', 2, '3:41');
--   select void_bout('<bout id>', 'NC');
--   select release_result('<bout id>');                  hand it back to the feed
--
-- A correction is marked manual, so the feed never overwrites it, and the
-- event is re-scored straight away: the results sync is asked to run for it,
-- which also sends "Correction" notifications to anyone whose points moved.

-- Every bout from the last two weeks with its current result, newest first.
create view public.recent_bouts with (security_invoker = true) as
select b.id as bout_id,
       e.name as event,
       b.fight_order as bout,
       red.name as red,
       blue.name as blue,
       coalesce(w.name || ' · ' || r.method::text || coalesce(' · R' || r.round, ''), r.void_reason::text,
                case when b.status = 'cancelled' then 'cancelled' else 'no result' end) as result,
       r.status as result_status,
       coalesce(r.manual_override, false) as manual
from public.bouts b
join public.events e on e.id = b.event_id
join public.fighters red on red.id = b.red_fighter_id
join public.fighters blue on blue.id = b.blue_fighter_id
left join public.results r on r.bout_id = b.id
left join public.fighters w on w.id = r.winner_fighter_id
where e.starts_at >= now() - interval '14 days' and e.starts_at <= now() + interval '1 day'
order by e.starts_at desc, b.fight_order;

revoke all on public.recent_bouts from anon, authenticated;

-- Asks the results sync to re-score one event now. Without the Vault secrets
-- (a local stack) it only marks the event due, which the next scheduled run
-- picks up within the polling window.
create function public.rescore_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  update public.events e set results_due_at = now() where e.id = rescore_event.event_id;

  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'card_sync_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/sync-results',
    headers := jsonb_build_object('content-type', 'application/json', 'x-card-sync-secret', secret),
    body    := jsonb_build_object('eventId', event_id),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Sets a bout's result by hand. `winner` is 'red', 'blue', or part of the
-- winner's name ("Hernandez"). Decisions take no round; the time is
-- optional ("3:41").
create function public.correct_result(
  bout uuid, winner text, method public.result_method, ended_round int default null, ended_time text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bouts%rowtype;
  winner_id uuid;
begin
  select * into b from public.bouts where id = bout;
  if not found then
    raise exception 'bout % not found', bout;
  end if;

  winner_id := case
    when lower(winner) = 'red' then b.red_fighter_id
    when lower(winner) = 'blue' then b.blue_fighter_id
    else (select f.id from public.fighters f
          where f.id in (b.red_fighter_id, b.blue_fighter_id) and f.name ilike '%' || winner || '%')
  end;
  if winner_id is null then
    raise exception 'no fighter in this bout matches "%"; use red, blue or part of their name', winner;
  end if;
  if method = 'DEC' and ended_round is not null then
    raise exception 'a decision has no round; leave it null';
  end if;
  if method <> 'DEC' and ended_round is null then
    raise exception 'a finish needs the round it ended in';
  end if;

  insert into public.results as r
    (bout_id, status, winner_fighter_id, method, round, time, void_reason, source, manual_override)
  values (bout, 'final', winner_id, method, ended_round, ended_time, null, 'manual', true)
  on conflict (bout_id) do update set
    status = 'final', winner_fighter_id = excluded.winner_fighter_id, method = excluded.method,
    round = excluded.round, time = excluded.time, void_reason = null,
    source = 'manual', manual_override = true;

  perform public.rescore_event(b.event_id);
  return 'corrected and re-scoring';
end;
$$;

-- Voids a bout by hand: 'NC', 'DRAW', 'CANCELLED' or 'FIGHTER_CHANGED'.
create function public.void_bout(bout uuid, reason public.void_reason)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev uuid;
begin
  select event_id into ev from public.bouts where id = bout;
  if ev is null then
    raise exception 'bout % not found', bout;
  end if;

  insert into public.results as r
    (bout_id, status, winner_fighter_id, method, round, time, void_reason, source, manual_override)
  values (bout, 'final', null, null, null, null, reason, 'manual', true)
  on conflict (bout_id) do update set
    status = 'final', winner_fighter_id = null, method = null, round = null, time = null,
    void_reason = excluded.void_reason, source = 'manual', manual_override = true;

  perform public.rescore_event(ev);
  return 'voided and re-scoring';
end;
$$;

-- Hands a bout back to the feed: the manual result stays until the feed next
-- reports one, which then replaces it.
create function public.release_result(bout uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev uuid;
begin
  select event_id into ev from public.bouts where id = bout;
  if ev is null then
    raise exception 'bout % not found', bout;
  end if;
  update public.results set manual_override = false, source = 'manual' where bout_id = bout;
  perform public.rescore_event(ev);
  return 'released to the feed';
end;
$$;

revoke execute on function public.rescore_event(uuid) from public, anon, authenticated;
revoke execute on function public.correct_result(uuid, text, public.result_method, int, text) from public, anon, authenticated;
revoke execute on function public.void_bout(uuid, public.void_reason) from public, anon, authenticated;
revoke execute on function public.release_result(uuid) from public, anon, authenticated;
