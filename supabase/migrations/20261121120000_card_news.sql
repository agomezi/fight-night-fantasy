-- Card news: three new pushes, all in the inbox.
--
--   odds      A fight you picked flips underdog before it locks. Scoring already
--             uses the underdog frozen at the lock, so this only tells you.
--             Each way at most once per bout version, so a wobbling line
--             can't spam.
--   schedule  A card whose main card isn't on a Saturday between 6:30 and 10:30
--             PM Eastern: "UFC 333 starts earlier than usual". If its time then
--             moves by 30 minutes or more, one "moved" push follows.
--   rank      Your career rank went up: once per rank, and once more per rank
--             after the pre-season is wiped at Season 1.
--
-- Odds and schedule pushes follow a new toggle, and they wait for the player's
-- daytime (9 AM to 10 PM in their own zone) instead of buzzing at night: the
-- row stays unpushed and the card-news cron sends it later. Rank-ups follow
-- the card recap toggle.

-------------------------------------------------------------------------------
-- Profiles: the toggle and the phone's time zone
-------------------------------------------------------------------------------

alter table public.profiles
  add column notify_card_news boolean not null default true,
  add column time_zone text check (time_zone is null or char_length(time_zone) between 1 and 64);

grant update (notify_card_news, time_zone) on public.profiles to authenticated;

-- A zone Postgres doesn't know is stored as no zone, so it can never break a
-- query that reads it.
create function public.clean_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_zone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    new.time_zone := null;
  end if;
  return new;
end;
$$;

create trigger profiles_clean_time_zone before insert or update of time_zone on public.profiles
  for each row execute function public.clean_time_zone();

-- Odds and schedule pushes wait out the night in the player's zone (Eastern
-- when we don't know it).
create function public.push_deferred(kind text, time_zone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select kind in ('odds', 'schedule')
     and extract(hour from now() at time zone coalesce(time_zone, 'America/New_York')) not between 9 and 21;
$$;

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards',
                    'odds', 'schedule', 'rank'));

-------------------------------------------------------------------------------
-- Odds flips
-------------------------------------------------------------------------------

-- The last underdog a bout had. Level odds store no underdog, so without this
-- red → level → blue would never read as a flip. New fighters start over.
alter table public.bouts add column last_underdog_corner public.corner;
update public.bouts set last_underdog_corner = underdog_corner where underdog_corner is not null;

-- Runs after bouts_guard_odds (triggers fire in name order), so it sees the
-- underdog that guard leaves.
create function public.hold_last_underdog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version <> old.version
     or new.red_fighter_id <> old.red_fighter_id or new.blue_fighter_id <> old.blue_fighter_id then
    new.last_underdog_corner := new.underdog_corner;
  elsif new.underdog_corner is not null then
    new.last_underdog_corner := new.underdog_corner;
  end if;
  return new;
end;
$$;

create trigger bouts_hold_last_underdog before update on public.bouts
  for each row execute function public.hold_last_underdog();

-- Everyone with a pick on a bout whose underdog just flipped. Once per
-- statement, so an odds run over a whole card calls the push once. It runs as
-- its owner (the odds sync's role can't write notifications on hosted) and
-- never fails the update that fired it.
create function public.queue_odds_flips()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from new_rows n join old_rows o on o.id = n.id
    where n.underdog_corner is distinct from o.underdog_corner
  ) then
    return null;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select k.user_id, 'odds', n.id || ':' || n.version || ':' || n.underdog_corner,
    jsonb_build_object(
      'event', e.name,
      'eventId', e.id,
      'boutId', n.id,
      'picked', pf.name,
      'pickedIsDog', k.picked_fighter_id = case n.underdog_corner when 'red' then n.red_fighter_id else n.blue_fighter_id end,
      'dog', case n.underdog_corner when 'red' then r.name else bl.name end,
      'favorite', case n.underdog_corner when 'red' then bl.name else r.name end
    ),
    false
  from new_rows n
  join old_rows o on o.id = n.id
  join public.events e on e.id = n.event_id
  join public.picks k on k.bout_id = n.id and k.bout_version = n.version
  join public.profiles p on p.id = k.user_id and p.deleted_at is null
  join public.fighters pf on pf.id = k.picked_fighter_id
  join public.fighters r on r.id = n.red_fighter_id
  join public.fighters bl on bl.id = n.blue_fighter_id
  where n.underdog_corner is not null
    and o.last_underdog_corner is not null
    and n.underdog_corner <> o.last_underdog_corner
    and n.version = o.version
    and n.status = 'scheduled'
    and coalesce(n.locks_at, e.locks_at) > now()
  on conflict do nothing;

  if found then
    perform public.invoke_activity_push();
  end if;
  return null;
exception when others then
  raise warning 'odds flip notifications failed: %', sqlerrm;
  return null;
end;
$$;

create trigger bouts_odds_flips after update on public.bouts
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.queue_odds_flips();

-------------------------------------------------------------------------------
-- Unusual start times
-------------------------------------------------------------------------------

-- The main card time each card was announced with, so a later move is caught.
create table public.schedule_notices (
  event_id uuid primary key references public.events (id) on delete cascade,
  main_at  timestamptz not null,
  sent_at  timestamptz not null default now()
);

alter table public.schedule_notices enable row level security;
revoke all on public.schedule_notices from anon, authenticated, service_role;

-- Cards from 2 hours to 4 days before their first lock. An unusual one is
-- announced once; one already announced is announced again if its main card
-- moves by 30 minutes or more. Returns how many rows it queued.
create function public.queue_schedule_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev       record;
  prev     timestamptz;
  et       timestamp;
  said     text;
  note_key text;
  queued   integer := 0;
  n        integer;
begin
  for ev in
    select e.id, e.name,
           min(coalesce(b.locks_at, e.locks_at)) as first_at,
           coalesce(min(coalesce(b.locks_at, e.locks_at)) filter (where b.card_segment = 'main'),
                    min(coalesce(b.locks_at, e.locks_at))) as main_at
    from public.events e
    join public.bouts b on b.event_id = e.id and b.status = 'scheduled'
    where e.status = 'scheduled'
    group by e.id, e.name
    having min(coalesce(b.locks_at, e.locks_at)) > now() + interval '2 hours'
       and min(coalesce(b.locks_at, e.locks_at)) <= now() + interval '4 days'
  loop
    select s.main_at into prev from public.schedule_notices s where s.event_id = ev.id;
    et := ev.main_at at time zone 'America/New_York';

    if prev is null then
      if extract(isodow from et) = 6 and et::time between time '18:30' and time '22:30' then
        continue;
      end if;
      said := case when extract(isodow from et) <> 6 then 'day' when et::time < time '18:30' then 'early' else 'late' end;
      note_key := ev.id || ':unusual';
      insert into public.schedule_notices (event_id, main_at) values (ev.id, ev.main_at);
    elsif abs(extract(epoch from ev.main_at - prev)) >= 1800 then
      said := 'moved';
      note_key := ev.id || ':moved:' || extract(epoch from ev.main_at)::bigint;
      update public.schedule_notices set main_at = ev.main_at, sent_at = now() where event_id = ev.id;
    else
      continue;
    end if;

    -- Everyone who has finished signing up and is in good standing.
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    select p.id, 'schedule', note_key,
      jsonb_build_object('event', ev.name, 'eventId', ev.id, 'firstAt', ev.first_at, 'mainAt', ev.main_at,
                         'when', said, 'hasPrelims', ev.first_at < ev.main_at),
      false
    from public.profiles p
    where p.deleted_at is null and p.display_name is not null
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'banned'
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'suspended'
    on conflict do nothing;
    get diagnostics n = row_count;
    queued := queued + n;
  end loop;
  return queued;
end;
$$;

-- Every 15 minutes: queue schedule notices, and send anything waiting that
-- can go out now (including odds and schedule pushes held overnight).
create function public.card_news_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_schedule_notifications();
  if exists (
    select 1 from public.notifications_sent n
    join public.profiles p on p.id = n.user_id
    where not n.pushed and not public.push_deferred(n.kind, p.time_zone)
  ) then
    perform public.invoke_activity_push();
  end if;
end;
$$;

-------------------------------------------------------------------------------
-- Rank-ups
-------------------------------------------------------------------------------

-- The career ladder, as in my_career().
create function public.career_rank_for(points integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when points >= 150 then 'Legend'
    when points >= 60 then 'Champion'
    when points >= 35 then 'Title Challenger'
    when points >= 15 then 'Ranked'
    when points >= 5 then 'Contender'
    else 'Prospect'
  end;
$$;

-- Pre-season ranks are keyed apart, because the Season 1 launch wipes the
-- pre-season's cards and everyone climbs again.
create function public.rank_key(rank text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when public.current_season() is null then 'pre:' else '' end || rank;
$$;

-- Players on this card who reached a new rank. Called by the results sync
-- after settling; card_results only has rows once the card is final.
create function public.claim_rank_notifications(event uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with players as (
    select c.user_id from public.card_results c where c.event_id = event
  ),
  career as (
    select c.user_id, public.career_rank_for((count(*) + count(*) filter (where c.result = 'W'))::integer) as rank
    from public.card_results c
    where c.user_id in (select pl.user_id from players pl)
    group by c.user_id
  ),
  candidates as (
    select c.user_id, c.rank, public.rank_key(c.rank) as key
    from career c
    join public.profiles p on p.id = c.user_id and p.deleted_at is null
    where c.rank <> 'Prospect'
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'rank', c.key,
      jsonb_build_object('rank', c.rank, 'event', (select e.name from public.events e where e.id = event))
    from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key, notifications_sent.payload
  )
  select k.user_id, 'rank'::text, k.payload,
    array(select t.token from public.push_tokens t where t.user_id = k.user_id),
    p.notify_summary
  from claimed k
  join public.profiles p on p.id = k.user_id;
$$;

-- Ranks already reached count as announced, every rung up to the current one,
-- so the deploy announces nothing old. No payload: not in the inbox.
insert into public.notifications_sent (user_id, kind, key, pushed)
select c.user_id, 'rank', public.rank_key(l.rank), true
from (
  select c.user_id, (count(*) + count(*) filter (where c.result = 'W'))::integer as points
  from public.card_results c
  join public.profiles p on p.id = c.user_id and p.deleted_at is null
  group by c.user_id
) c
join (values ('Contender', 5), ('Ranked', 15), ('Title Challenger', 35), ('Champion', 60), ('Legend', 150)) l(rank, at)
  on l.at <= c.points
on conflict do nothing;

-------------------------------------------------------------------------------
-- Sending
-------------------------------------------------------------------------------

-- As before, plus: odds and schedule follow the card news toggle and wait out
-- the night (left unpushed for the card-news cron); an odds push for a bout
-- that has locked, or a schedule push for a card already under way, is
-- dropped; a schedule push carries the player's zone so its times read right.
create or replace function public.claim_activity_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications_sent n set pushed = true
    from public.profiles p
    where not n.pushed and p.id = n.user_id
      and not public.push_deferred(n.kind, p.time_zone)
    returning n.user_id, n.kind, n.payload, n.sent_at
  )
  select c.user_id, c.kind,
    case when c.kind = 'schedule'
         then c.payload || jsonb_build_object('tz', coalesce(p.time_zone, 'America/New_York'))
         else c.payload end,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    case c.kind
      when 'moderation' then true
      when 'reminder' then p.notify_reminders
      when 'odds' then p.notify_card_news and exists (
        select 1 from public.bouts b join public.events e on e.id = b.event_id
        where b.id = (c.payload ->> 'boutId')::uuid and coalesce(b.locks_at, e.locks_at) > now()
      )
      when 'schedule' then p.notify_card_news and (c.payload ->> 'firstAt')::timestamptz > now()
      else p.notify_league_activity
    end and c.sent_at > now() - interval '1 day'
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;

-- Builds from before 10/16 read the inbox through these and would show an
-- unknown kind as a card's final score, so the newer kinds stay out of theirs.
create or replace function public.my_notifications(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items(200) with ordinality i
  where i.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank')
  order by i.ordinality
  limit least(greatest(max_rows, 1), 200);
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank');
$$;

-------------------------------------------------------------------------------
-- Access and schedule
-------------------------------------------------------------------------------

revoke execute on function
  public.clean_time_zone(), public.push_deferred(text, text), public.hold_last_underdog(), public.queue_odds_flips(),
  public.queue_schedule_notifications(), public.card_news_tick(), public.career_rank_for(integer),
  public.rank_key(text), public.claim_rank_notifications(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_rank_notifications(uuid) to service_role;

select cron.schedule('card-news', '*/15 * * * *', $$select public.card_news_tick()$$);
