-- Push notifications, before, during and after a card.
--
--   reminder  an hour before the card starts locking
--   scored    each time a fight you picked is scored, again if a correction
--             changes your points
--   final     once every result on the card is official: your total
--
-- Phones register an Expo push token; the `sync-results` Edge Function claims
-- what is due here and sends it through Expo's push service. Claiming marks a
-- notification sent in the same statement that finds it, so two runs never
-- send the same one twice. Notifications are claimed whether or not the
-- player has a phone registered or has that kind turned on, so switching
-- notifications on later never releases a backlog of old ones.

-------------------------------------------------------------------------------
-- Tokens and preferences
-------------------------------------------------------------------------------

create table public.push_tokens (
  token      text primary key check (char_length(token) between 10 and 200),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- A phone belongs to whoever last signed in on it, so registering takes the
-- token over from any previous account.
create function public.register_push_token(token text, platform text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_tokens (token, user_id, platform)
  values (token, (select auth.uid()), platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;

-- On sign-out, so a shared phone stops getting the last account's alerts.
create function public.unregister_push_token(token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens t where t.token = unregister_push_token.token and t.user_id = (select auth.uid());
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

alter table public.profiles
  add column notify_reminders boolean not null default true,
  add column notify_results   boolean not null default true,
  add column notify_summary   boolean not null default true;

grant update (notify_reminders, notify_results, notify_summary) on public.profiles to authenticated;

-------------------------------------------------------------------------------
-- What has been sent
-------------------------------------------------------------------------------

create table public.notifications_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind    text not null check (kind in ('reminder', 'scored', 'final')),
  -- reminder and final: the event; scored: the bout and the points it gave,
  -- so a correction that changes the points is a new notification.
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.notifications_sent enable row level security;
revoke all on public.notifications_sent from anon, authenticated;

-- Everything already scored counts as sent, so the first run after this
-- migration does not notify anyone about cards that are already over.
insert into public.notifications_sent (user_id, kind, key)
select s.user_id, 'scored', s.bout_id || ':' || s.points from public.scores s
on conflict do nothing;
insert into public.notifications_sent (user_id, kind, key)
select distinct s.user_id, 'final', b.event_id::text
from public.scores s join public.bouts b on b.id = s.bout_id
on conflict do nothing;

-- Deleting an account removes its phones and its notification record.
create function public.clear_notifications_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.push_tokens where user_id = old.id;
    delete from public.notifications_sent where user_id = old.id;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_notifications after update of deleted_at on public.profiles
  for each row execute function public.clear_notifications_on_delete();

-------------------------------------------------------------------------------
-- Claiming what is due
-------------------------------------------------------------------------------

-- Scores and recaps due for one event. Each row carries the player's phones
-- and whether they want that kind, so the sender needs nothing else.
create function public.claim_event_notifications(event_id uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ev public.events%rowtype;
  is_final boolean;
begin
  select * into ev from public.events e where e.id = claim_event_notifications.event_id;
  if not found then
    return;
  end if;

  -- Final once the card is over and nothing still scheduled lacks a final
  -- result.
  is_final := ev.status = 'complete' and not exists (
    select 1 from public.bouts b
    left join public.results r on r.bout_id = b.id
    where b.event_id = ev.id and b.status = 'scheduled' and (r.bout_id is null or r.status <> 'final')
  );

  return query
  with scored as (
    select s.user_id, 'scored'::text as kind, s.bout_id || ':' || s.points as key,
      jsonb_build_object(
        'event', ev.name,
        'points', s.points,
        'correct', s.correct,
        'counts', s.counts_for_accuracy,
        'provisional', s.provisional,
        'winner', w.name,
        'loser', case when r.winner_fighter_id = b.red_fighter_id then blue.name else red.name end,
        'red', red.name,
        'blue', blue.name,
        'method', r.method,
        'round', r.round,
        'time', r.time,
        'void', coalesce(r.void_reason::text, case when b.status = 'cancelled' then 'CANCELLED' end),
        'correction', exists (
          select 1 from public.notifications_sent n
          where n.user_id = s.user_id and n.kind = 'scored' and n.key like s.bout_id || ':%'
        )
      ) as payload
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.fighters red on red.id = b.red_fighter_id
    join public.fighters blue on blue.id = b.blue_fighter_id
    left join public.results r on r.bout_id = b.id
    left join public.fighters w on w.id = r.winner_fighter_id
    where b.event_id = ev.id
  ),
  final as (
    select s.user_id, 'final'::text as kind, ev.id::text as key,
      jsonb_build_object(
        'event', ev.name,
        'points', sum(s.points),
        'hit', count(*) filter (where s.correct),
        'total', count(*) filter (where s.counts_for_accuracy)
      ) as payload
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    where is_final and b.event_id = ev.id
    group by s.user_id
  ),
  candidates as (
    select * from scored
    union all
    select * from final
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key)
    select c.user_id, c.kind, c.key from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.kind, notifications_sent.key
  )
  select c.user_id, c.kind, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    case c.kind when 'scored' then p.notify_results else p.notify_summary end
  from candidates c
  join claimed k on k.user_id = c.user_id and k.kind = c.kind and k.key = c.key
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
end;
$$;

-- Lock reminders: an hour before a card's first section locks, for every
-- player with a phone registered.
create function public.claim_reminders()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select e.id, e.name, e.locks_at from public.events e
    where e.status = 'scheduled' and e.locks_at > now() and e.locks_at <= now() + interval '60 minutes'
  ),
  candidates as (
    select p.id as user_id, d.id as event_id,
      jsonb_build_object(
        'event', d.name,
        'minutes', greatest(1, round(extract(epoch from d.locks_at - now()) / 60)),
        'hasMainPick', exists (
          select 1 from public.picks k
          join public.bouts b on b.id = k.bout_id
          where k.user_id = p.id and b.event_id = d.id and b.fight_order = 1 and b.status = 'scheduled'
        )
      ) as payload
    from due d
    cross join public.profiles p
    where p.deleted_at is null and exists (select 1 from public.push_tokens t where t.user_id = p.id)
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key)
    select c.user_id, 'reminder', c.event_id::text from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  select c.user_id, 'reminder'::text, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_reminders
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.event_id::text
  join public.profiles p on p.id = c.user_id;
$$;

-- Tokens Expo reports as no longer valid (the app was deleted).
create function public.remove_push_tokens(tokens text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = any (tokens);
$$;

revoke execute on function public.claim_event_notifications(uuid) from public, anon, authenticated;
revoke execute on function public.claim_reminders() from public, anon, authenticated;
revoke execute on function public.remove_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.claim_event_notifications(uuid) to service_role;
grant execute on function public.claim_reminders() to service_role;
grant execute on function public.remove_push_tokens(text[]) to service_role;

-------------------------------------------------------------------------------
-- Schedule
-------------------------------------------------------------------------------

-- Every 5 minutes, but the function is only called when a card starts
-- locking within the hour.
create function public.invoke_reminders()
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

select cron.schedule('lock-reminders', '*/5 * * * *', $$select public.invoke_reminders()$$);
