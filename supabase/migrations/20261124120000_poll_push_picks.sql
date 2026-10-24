-- Two things from fight night:
--
--   poll pushes     "New question: …" when Home starts showing a take you
--                   haven't voted on. At most one every 3 days a player, in
--                   their daytime, behind its own toggle.
--   any matchup     Tapping someone else's matchup shows both sides' picks,
--                   each revealed as its section locks, as your own are.

-------------------------------------------------------------------------------
-- Poll pushes
-------------------------------------------------------------------------------

alter table public.profiles add column notify_polls boolean not null default true;

grant select (notify_polls), update (notify_polls) on public.profiles to authenticated;

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards',
                    'odds', 'schedule', 'rank', 'poll'));

-- The take Home shows at `at`, if it's one still open for at least an hour.
-- Home's card is the same for everyone that day, so this is the one question
-- a push can be about, and tapping the push lands on it.
create function public.home_poll_at(at timestamptz)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  card jsonb := public.community_card_for(null, at, true);
  poll uuid;
begin
  if card ->> 'type' is distinct from 'poll' or card ->> 'phase' is distinct from 'open' then
    return null;
  end if;
  poll := (card -> 'poll' ->> 'id')::uuid;
  if public.poll_close_at(poll) <= at + interval '1 hour' then
    return null;
  end if;
  return poll;
end;
$$;

-- Queues the Home take for every player who wants it and hasn't voted on it,
-- unless they had a poll push in the last 3 days. Only in the player's
-- daytime (9 AM to 10 PM in their zone, Eastern without one): Home's card
-- changes at midnight Eastern, and a later run the same day reaches the rest.
-- Keyed by the poll, so running again never repeats. Returns how many queued.
create function public.queue_poll_notifications(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll    uuid := public.home_poll_at(at);
  payload jsonb;
  n       integer;
begin
  if poll is null then
    return 0;
  end if;
  select jsonb_build_object('pollId', p.id, 'eventId', p.event_id, 'question', p.question,
                            'closesAt', public.poll_close_at(p.id))
    into payload
  from public.community_polls p where p.id = poll;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed, sent_at)
  select p.id, 'poll', poll::text, payload, false, at
  from public.profiles p
  where p.deleted_at is null and p.display_name is not null and p.notify_polls
    and not exists (select 1 from public.sidelined_players() x where x.user_id = p.id)
    and extract(hour from at at time zone coalesce(p.time_zone, 'America/New_York')) between 9 and 21
    and not exists (select 1 from public.poll_votes v where v.poll_id = poll and v.user_id = p.id)
    and not exists (
      select 1 from public.notifications_sent x
      where x.user_id = p.id and x.kind = 'poll' and x.sent_at > at - interval '3 days'
    )
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Every 15 minutes. A failure here only costs this run's poll pushes.
create function public.poll_push_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.queue_poll_notifications() > 0 then
    perform public.invoke_activity_push();
  end if;
exception when others then
  raise warning 'poll notifications failed: %', sqlerrm;
end;
$$;

-- Called by the results sync's activity run, apart from the other pushes so
-- neither can hold up the other. Dropped if the player turned them off since,
-- the row is more than a day old, or the take has closed.
create function public.claim_poll_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications_sent n set pushed = true
    where n.kind = 'poll' and not n.pushed
    returning n.user_id, n.kind, n.payload, n.sent_at
  )
  select c.user_id, c.kind, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_polls and c.sent_at > now() - interval '1 day' and (c.payload ->> 'closesAt')::timestamptz > now()
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;

-- As in card news, but poll rows are left for claim_poll_notifications, so
-- they never go out under the league activity toggle.
create or replace function public.claim_activity_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications_sent n set pushed = true
    from public.profiles p
    where not n.pushed and p.id = n.user_id and n.kind <> 'poll'
      and not public.push_deferred(n.kind, p.time_zone, public.push_deadline(n.kind, n.payload))
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

-------------------------------------------------------------------------------
-- The inbox
-------------------------------------------------------------------------------

-- Every kind, for this build on. Builds before it show a kind they don't
-- know as "You have a new notification" opening History, so the RPCs they
-- call leave poll pushes out.
create function public.inbox_items_v2(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.kind, n.key,
    case
      when n.kind = 'league_join'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 2)
       )
      then jsonb_set(n.payload, '{member}', '"Blocked player"')
      when n.kind = 'league_join' and public.name_hidden(split_part(n.key, ':', 2)::uuid)
      then jsonb_set(n.payload, '{member}', '"Player"')
      when n.kind = 'matchup'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 3)
       )
      then jsonb_set(n.payload, '{opponent}', '"Blocked player"')
      when n.kind = 'matchup' and public.name_hidden(split_part(n.key, ':', 3)::uuid)
      then jsonb_set(n.payload, '{opponent}', '"Player"')
      else n.payload
    end,
    n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;

create function public.inbox_unread_count_v2()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

create or replace function public.inbox_items(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items_v2(200) with ordinality i
  where i.kind <> 'poll'
  order by i.ordinality
  limit least(greatest(max_rows, 1), 200);
$$;

create or replace function public.inbox_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind <> 'poll';
$$;

create or replace function public.my_notifications(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items_v2(200) with ordinality i
  where i.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank', 'poll')
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
    and n.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank', 'poll');
$$;

-------------------------------------------------------------------------------
-- Any matchup's picks
-------------------------------------------------------------------------------

-- Both sides of a matchup in your league that week, bout by bout, for the
-- part of the card the league plays. Like matchup_picks, except neither side
-- has to be you: a side's pick shows once its bout's section has locked, or
-- always when that side is you. Before that, only whether they're locked in.
create function public.league_matchup_picks(league uuid, event uuid, a uuid, b uuid)
returns table (
  bout_id      uuid,
  fight_order  smallint,
  card_segment public.card_segment,
  locked       boolean,
  voided       boolean,
  red_id       uuid,
  red_name     text,
  blue_id      uuid,
  blue_name    text,
  a_shown      boolean,
  a_fighter    uuid,
  a_finish     public.finish_kind,
  a_round      smallint,
  a_method     public.pick_method,
  a_points     integer,
  b_shown      boolean,
  b_fighter    uuid,
  b_finish     public.finish_kind,
  b_round      smallint,
  b_method     public.pick_method,
  b_points     integer,
  a_locked_in  boolean,
  b_locked_in  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t  public.league_tier;
begin
  perform public.require_league_member(league);
  if a is null or b is null or not exists (
    select 1 from public.league_schedule(league, public.current_season()) s
    where s.event_id = event
      and ((s.user_a = a and s.user_b = b) or (s.user_a = b and s.user_b = a))
  ) then
    raise exception 'Those players don''t face each other on that card.' using errcode = 'P0001', hint = 'not_matchup';
  end if;

  select l.tier into t from public.leagues l where l.id = league;

  return query
  with card as (
    select x.*,
           coalesce(x.locks_at, e.locks_at) <= now() as is_locked,
           public.changed_after_lock(x.id) as is_void
    from public.bouts x
    join public.events e on e.id = x.event_id
    where x.event_id = event and x.status = 'scheduled'
      and public.bout_counts_for_tier(t, x.id)
  ),
  -- Only picks made against the bout as it stands.
  side as (
    select c.id as bout, k.user_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           (select case when t = 'casual' then s.casual_points else s.points end
            from public.scores s where s.user_id = k.user_id and s.bout_id = c.id) as pts
    from card c
    join public.picks k on k.bout_id = c.id and k.bout_version = c.version
    where k.user_id in (a, b)
  )
  select c.id, c.fight_order, c.card_segment, c.is_locked, c.is_void,
         c.red_fighter_id, rf.name, c.blue_fighter_id, bf.name,
         c.is_locked or a = me,
         sa.picked_fighter_id, sa.finish, sa.finish_round, sa.method, sa.pts,
         c.is_locked or b = me,
         sb.picked_fighter_id, sb.finish, sb.finish_round, sb.method, sb.pts,
         public.met_league_picks(league, a, event),
         public.met_league_picks(league, b, event)
  from card c
  join public.fighters rf on rf.id = c.red_fighter_id
  join public.fighters bf on bf.id = c.blue_fighter_id
  -- Nothing of a side's on a bout that hasn't locked, not even whether it's
  -- picked, unless that side is you.
  left join side sa on sa.bout = c.id and sa.user_id = a and (c.is_locked or a = me)
  left join side sb on sb.bout = c.id and sb.user_id = b and (c.is_locked or b = me)
  order by c.fight_order;
end;
$$;

-------------------------------------------------------------------------------
-- Access and schedule
-------------------------------------------------------------------------------

revoke execute on function
  public.home_poll_at(timestamptz), public.queue_poll_notifications(timestamptz), public.poll_push_tick(),
  public.claim_poll_notifications()
  from public, anon, authenticated;
grant execute on function public.claim_poll_notifications() to service_role;

revoke execute on function public.inbox_items_v2(integer), public.inbox_unread_count_v2(),
  public.league_matchup_picks(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.inbox_items_v2(integer), public.inbox_unread_count_v2(),
  public.league_matchup_picks(uuid, uuid, uuid, uuid)
  to authenticated;

select cron.schedule('poll-pushes', '*/15 * * * *', $$select public.poll_push_tick()$$);
