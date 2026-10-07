-- League activity notifications, and an inbox for every notification.
--
--   league_join  someone joined a league you own
--
-- Joins are recorded by join_league itself, in the same transaction, and
-- pushed at once: join_league asks the sync-results Edge Function to send
-- what is pending, and a five-minute job catches anything that call missed.
-- Like every other kind, a join is claimed whether or not the owner wants it
-- pushed, so turning the toggle back on never releases a backlog.
--
-- Rejoining over and over can't spam an owner: a player's join to a league
-- notifies its owner at most once a week.
--
-- notifications_sent now also keeps what each notification said and whether
-- it has been read, and is the in-app inbox. Rows from before this migration
-- carry no payload and stay out of it.

-------------------------------------------------------------------------------
-- Preference and storage
-------------------------------------------------------------------------------

alter table public.profiles
  add column notify_league_activity boolean not null default true;

grant update (notify_league_activity) on public.profiles to authenticated;

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check check (kind in ('reminder', 'scored', 'final', 'league_join')),
  -- What the notification said, for the inbox. The app words it, as the
  -- push does, from the same payload.
  add column payload jsonb,
  add column read_at timestamptz,
  -- False until the push has been handed to the sender. Card notifications
  -- are pushed in the call that records them, so they start true.
  add column pushed  boolean not null default true;

create index notifications_sent_inbox_idx on public.notifications_sent (user_id, sent_at desc)
  where payload is not null;
create index notifications_sent_pending_idx on public.notifications_sent (sent_at) where not pushed;

-------------------------------------------------------------------------------
-- Card notifications, now kept for the inbox
-------------------------------------------------------------------------------

-- As before, storing each payload.
create or replace function public.claim_event_notifications(event_id uuid)
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
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, c.kind, c.key, c.payload from candidates c
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
create or replace function public.claim_reminders()
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
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'reminder', c.event_id::text, c.payload from candidates c
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

revoke execute on function public.claim_event_notifications(uuid) from public, anon, authenticated;
revoke execute on function public.claim_reminders() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- League joins
-------------------------------------------------------------------------------

-- Asks the sender to push what is pending. pg_net sends the request only once
-- the transaction commits, so a join that fails sends nothing.
create function public.invoke_activity_push()
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
    url     := base_url || '/functions/v1/sync-results',
    headers := jsonb_build_object('content-type', 'application/json', 'x-card-sync-secret', secret),
    body    := '{"mode": "activity"}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.invoke_activity_push() from public, anon, authenticated;

-- Records that `member` joined `league` for its owner, unless the owner is
-- the one joining or already heard about this player joining in the last week.
create function public.queue_league_join(league uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues%rowtype;
begin
  select * into l from public.leagues where id = league;
  if not found or l.owner_id = member then
    return;
  end if;
  if exists (
    select 1 from public.notifications_sent n
    where n.user_id = l.owner_id and n.kind = 'league_join'
      and n.key like league || ':' || member || ':%'
      and n.sent_at > now() - interval '7 days'
  ) then
    return;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  values (
    l.owner_id, 'league_join',
    league || ':' || member || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    jsonb_build_object('league', l.name, 'leagueId', l.id, 'member', public.league_display_name(member)),
    false
  );
  perform public.invoke_activity_push();
end;
$$;

revoke execute on function public.queue_league_join(uuid, uuid) from public, anon, authenticated;

-- As before, and the owner hears about it. Joining a league you are already
-- in still does nothing, so it notifies no one.
create or replace function public.join_league(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := public.require_named_player();
  league uuid;
  mine   public.league_members%rowtype;
  known  boolean;
begin
  select id into league from public.leagues
  where invite_code = lower(btrim(coalesce(code, '')));
  if not found then
    raise exception 'No league has that code.' using errcode = 'P0001', hint = 'not_found';
  end if;

  select * into mine from public.league_members where league_id = league and user_id = uid;
  known := found;
  if known and mine.left_at is null then
    return league;
  end if;

  perform public.check_league_capacity(uid);
  if (select count(*) from public.league_members where league_id = league and left_at is null)
     >= (select max_members from public.league_limits()) then
    raise exception 'That league is full.' using errcode = 'P0001', hint = 'full';
  end if;

  if known then
    update public.league_members set left_at = null where league_id = league and user_id = uid;
  else
    insert into public.league_members (league_id, user_id) values (league, uid);
  end if;
  perform public.queue_league_join(league, uid);
  return league;
end;
$$;


revoke execute on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

-- League activity not yet pushed, claimed in the statement that finds it.
-- One more than a day old is claimed but not wanted, so a sender that was down
-- doesn't deliver stale news.
create function public.claim_activity_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications_sent n set pushed = true
    where not n.pushed
    returning n.user_id, n.kind, n.payload, n.sent_at
  )
  select c.user_id, c.kind, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_league_activity and c.sent_at > now() - interval '1 day'
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;

revoke execute on function public.claim_activity_notifications() from public, anon, authenticated;
grant execute on function public.claim_activity_notifications() to service_role;

-- The backstop for a missed push: every five minutes, only when something is
-- waiting.
create function public.invoke_pending_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notifications_sent where not pushed) then
    perform public.invoke_activity_push();
  end if;
end;
$$;

revoke execute on function public.invoke_pending_activity() from public, anon, authenticated;

select cron.schedule('activity-push', '*/5 * * * *', $$select public.invoke_pending_activity()$$);

-------------------------------------------------------------------------------
-- Inbox
-------------------------------------------------------------------------------

-- Your notifications, newest first.
create function public.my_notifications(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.kind, n.key, n.payload, n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications_sent n set read_at = now()
  where n.user_id = (select auth.uid()) and n.read_at is null;
$$;

revoke execute on function public.my_notifications(integer), public.unread_notification_count(),
  public.mark_notifications_read() from public, anon;
grant execute on function public.my_notifications(integer), public.unread_notification_count(),
  public.mark_notifications_read() to authenticated;
