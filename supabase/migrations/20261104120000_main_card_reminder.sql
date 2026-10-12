-- A second lock reminder, 30 minutes before the main card locks.
--
-- Picks lock by section, so the main card is still open for hours after the
-- first reminder. This one goes out when it is about to close, and says how
-- many main card fights you have left to pick. It is a 'reminder' keyed
-- "<event>:main", so it shares the reminders toggle and the inbox. A card
-- whose main card is its first section already got the hour-out reminder and
-- gets no second one.

create or replace function public.claim_reminders()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with main_locks as (
    select e.id, e.name, e.locks_at as card_locks, min(b.locks_at) as main_locks
    from public.events e
    join public.bouts b on b.event_id = e.id
    where e.status in ('scheduled', 'live') and b.card_segment = 'main' and b.status = 'scheduled'
    group by e.id
  ),
  due as (
    select e.id, e.id::text as key, e.name, e.locks_at, null::text as section from public.events e
    where e.status = 'scheduled' and e.locks_at > now() and e.locks_at <= now() + interval '60 minutes'
    union all
    select m.id, m.id || ':main', m.name, m.main_locks, 'main' from main_locks m
    where m.main_locks > m.card_locks and m.main_locks > now() and m.main_locks <= now() + interval '30 minutes'
  ),
  candidates as (
    select p.id as user_id, d.key,
      jsonb_build_object(
        'event', d.name,
        'minutes', greatest(1, round(extract(epoch from d.locks_at - now()) / 60)),
        'hasMainPick', exists (
          select 1 from public.picks k
          join public.bouts b on b.id = k.bout_id
          where k.user_id = p.id and b.event_id = d.id and b.fight_order = 1 and b.status = 'scheduled'
        )
      ) || case when d.section = 'main' then jsonb_build_object(
        'section', 'main',
        'missing', (
          select count(*) from public.bouts b
          where b.event_id = d.id and b.card_segment = 'main' and b.status = 'scheduled'
            and not exists (select 1 from public.picks k where k.user_id = p.id and k.bout_id = b.id)
        )
      ) else '{}'::jsonb end as payload
    from due d
    cross join public.profiles p
    where p.deleted_at is null and exists (select 1 from public.push_tokens t where t.user_id = p.id)
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'reminder', c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  select c.user_id, 'reminder'::text, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_reminders
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.key
  join public.profiles p on p.id = c.user_id;
$$;

revoke execute on function public.claim_reminders() from public, anon, authenticated;
grant execute on function public.claim_reminders() to service_role;

-- The schedule only calls the function when a reminder could be due, so it
-- now also wakes for a main card locking within 30 minutes.
create or replace function public.invoke_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  if not exists (
    select 1 from public.events e
    where e.status = 'scheduled' and e.locks_at > now() and e.locks_at <= now() + interval '60 minutes'
  ) and not exists (
    select 1 from public.events e
    join public.bouts b on b.event_id = e.id
    where e.status in ('scheduled', 'live') and b.card_segment = 'main' and b.status = 'scheduled'
      and b.locks_at > now() and b.locks_at <= now() + interval '30 minutes'
  ) then
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
    body    := '{"mode": "reminders"}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.invoke_reminders() from public, anon, authenticated;
