-- Moving a league up a tier, never down.
--
-- The tier is kept per season. A season only starts when its first card
-- locks, and every card of a season plays at one tier, so an upgrade made
-- during Season N applies from Season N+1: Season N's cards keep scoring at
-- the old tier, and the first card of the next one plays the new tier. In the
-- pre-season, which Season 1 wipes, it applies at once.
--
-- Everything that scores a card or asks what it requires reads the tier for
-- that card's season. leagues.tier stays as the tier now, for display and
-- older builds, and moves when a season opens.

-------------------------------------------------------------------------------
-- The tier per season
-------------------------------------------------------------------------------

-- A league's tier from season number `from_season` on, until a later row.
-- 0 is the pre-season.
create table public.league_tiers (
  league_id   uuid not null references public.leagues (id) on delete cascade,
  from_season integer not null check (from_season >= 0),
  tier        public.league_tier not null,
  set_by      uuid references public.profiles (id) on delete set null,
  set_at      timestamptz not null default now(),
  primary key (league_id, from_season)
);

alter table public.league_tiers enable row level security;
-- Read and written only through the functions below.
revoke all on public.league_tiers from anon, authenticated;

insert into public.league_tiers (league_id, from_season, tier)
select l.id, 0, l.tier from public.leagues l;

-- A new league plays its tier from the start.
create function public.first_league_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.league_tiers (league_id, from_season, tier)
  values (new.id, 0, new.tier)
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.first_league_tier() from public, anon, authenticated;

create trigger leagues_first_tier after insert on public.leagues
  for each row execute function public.first_league_tier();

-- The season number a card is in: its slot's once slotted, otherwise the one
-- it will land in when it locks, counting the cards ahead of it the way
-- assign_season_slots does (11 a season). 0 for the pre-season.
create function public.card_season_number(event uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  ev      record;
  cur     public.seasons%rowtype;
  slotted integer;
  ahead   integer;
  idx     integer;
begin
  select e.id, e.season_id, e.locks_at into ev from public.events e where e.id = event;
  if not found then
    return null;
  end if;
  if ev.season_id is not null then
    return (select s.number from public.seasons s where s.id = ev.season_id);
  end if;

  select * into cur from public.seasons s where s.starts_at is not null order by s.number desc limit 1;
  if cur.id is null then
    return 0;
  end if;
  if ev.locks_at < cur.starts_at then
    return coalesce((
      select max(s.number) from public.seasons s where s.starts_at is not null and s.starts_at <= ev.locks_at
    ), 0);
  end if;

  slotted := (select coalesce(max(e.season_index), 0) from public.events e where e.season_id = cur.id);
  ahead := (
    select count(*) from public.events e
    where e.season_id is null and e.status <> 'cancelled' and e.id <> ev.id
      and e.locks_at >= cur.starts_at
      and (e.locks_at, e.id) < (ev.locks_at, ev.id)
  );
  idx := slotted + ahead + 1;
  return cur.number + case when idx <= 11 then 0 else (idx - 12) / 11 + 1 end;
end;
$$;

revoke execute on function public.card_season_number(uuid) from public, anon, authenticated;

-- The season the last card to lock is in: the one being played. 0 before
-- any card of Season 1 has locked.
create function public.season_in_play()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select public.card_season_number(e.id) from public.events e
    where e.status <> 'cancelled' and e.locks_at <= now()
    order by e.locks_at desc, e.id desc
    limit 1
  ), 0);
$$;

revoke execute on function public.season_in_play() from public, anon, authenticated;

-- The league's tier in season number `n`.
create function public.league_tier_at(league uuid, n integer)
returns public.league_tier
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select t.tier from public.league_tiers t
     where t.league_id = league and t.from_season <= coalesce(n, 0)
     order by t.from_season desc limit 1),
    (select l.tier from public.leagues l where l.id = league)
  );
$$;

-- The tier the league plays a card at; null for no card.
create function public.league_tier_for(league uuid, event uuid)
returns public.league_tier
language sql
stable
security definer
set search_path = ''
as $$
  select public.league_tier_at(league, x.n)
  from (select public.card_season_number(event) as n) x
  where x.n is not null;
$$;

-- The tier the league plays a season at; null is the pre-season.
create function public.league_season_tier(league uuid, season uuid)
returns public.league_tier
language sql
stable
security definer
set search_path = ''
as $$
  select public.league_tier_at(league, coalesce((select s.number from public.seasons s where s.id = season), 0));
$$;

revoke execute on function public.league_tier_at(uuid, integer), public.league_tier_for(uuid, uuid),
  public.league_season_tier(uuid, uuid) from public, anon, authenticated;

-- Sets leagues.tier to the tier of the latest season to open (the
-- pre-season's before Season 1). Returns whether it changed.
create function public.sync_league_tier(league uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leagues l
     set tier = public.league_tier_at(l.id, (
       select coalesce(max(s.number), 0) from public.seasons s where s.starts_at is not null
     ))
   where l.id = league
     and l.tier is distinct from public.league_tier_at(l.id, (
       select coalesce(max(s.number), 0) from public.seasons s where s.starts_at is not null
     ));
  return found;
end;
$$;

revoke execute on function public.sync_league_tier(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Telling the league
-------------------------------------------------------------------------------

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards',
                    'odds', 'schedule', 'rank', 'poll', 'name_restored', 'name_kept', 'tier'));

-- Every member hears it, except `skip` (the owner, who did it). `phase` is
-- scheduled, cancelled or started; `tier` is the tier it moves to, or for
-- cancelled the one it stays; `season` is when it starts (0: now). The push
-- goes out with the next activity run.
create function public.notify_league_tier(
  league uuid, tier public.league_tier, phase text, season integer, key text, skip uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues%rowtype;
begin
  select * into l from public.leagues x where x.id = league;
  if not found then
    return;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select m.user_id, 'tier', key,
         jsonb_build_object('league', l.name, 'leagueId', l.id, 'tier', notify_league_tier.tier,
                            'phase', phase, 'season', season),
         false
  from public.league_members m
  join public.profiles p on p.id = m.user_id
  where m.league_id = league and m.left_at is null and p.deleted_at is null
    and m.user_id is distinct from skip
  on conflict do nothing;
end;
$$;

revoke execute on function public.notify_league_tier(uuid, public.league_tier, text, integer, text, uuid)
  from public, anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- The owner's calls
-------------------------------------------------------------------------------

-- Moves the league up to `tier` and returns the season number it starts
-- from: 0 in the pre-season, where it applies at once, otherwise the season
-- after the one being played. Asking again before then replaces the tier
-- asked for.
create function public.schedule_tier_upgrade(league uuid, tier public.league_tier)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me   uuid := public.require_named_player();
  l    public.leagues%rowtype;
  at   integer;
  was  public.league_tier;
  asked public.league_tier;
begin
  select * into l from public.leagues x where x.id = schedule_tier_upgrade.league for update;
  if not found or l.owner_id is distinct from me then
    raise exception 'Only the league''s owner can change its tier.' using errcode = 'P0001', hint = 'not_owner';
  end if;
  if tier is null or tier = 'hardcore' then
    raise exception 'Hardcore leagues aren''t open yet.' using errcode = 'P0001', hint = 'tier_unavailable';
  end if;

  at := case when public.current_season() is null then 0 else public.season_in_play() + 1 end;
  was := public.league_tier_at(l.id, greatest(at - 1, 0));
  if tier <= was then
    raise exception 'A league can only move up a tier.' using errcode = 'P0001', hint = 'not_higher';
  end if;

  select t.tier into asked from public.league_tiers t where t.league_id = l.id and t.from_season = at;
  if asked = tier then
    return at;
  end if;

  insert into public.league_tiers (league_id, from_season, tier, set_by)
  values (l.id, at, tier, me)
  on conflict (league_id, from_season) do update
    set tier = excluded.tier, set_by = excluded.set_by, set_at = now();

  -- A league moving up to Pro starts on Pro's default minimum, the main card.
  if tier in ('pro', 'hardcore') and not exists (select 1 from public.league_pick_rules r where r.league_id = l.id) then
    insert into public.league_pick_rules (league_id, effective_at, scope)
    values (l.id, clock_timestamp(), 'main_card');
  end if;

  -- At once in the pre-season, or when the season it starts from has opened
  -- before its first card.
  perform public.sync_league_tier(l.id);
  perform public.notify_league_tier(
    l.id, tier, case when at = 0 then 'started' else 'scheduled' end, at,
    l.id || ':' || at || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, me
  );
  perform public.invoke_activity_push();
  return at;
end;
$$;

revoke execute on function public.schedule_tier_upgrade(uuid, public.league_tier) from public, anon;
grant execute on function public.schedule_tier_upgrade(uuid, public.league_tier) to authenticated;

-- Calls off a move up that hasn't started.
create function public.cancel_tier_upgrade(league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := public.require_named_player();
  l      public.leagues%rowtype;
  now_at integer := public.season_in_play();
begin
  select * into l from public.leagues x where x.id = cancel_tier_upgrade.league for update;
  if not found or l.owner_id is distinct from me then
    raise exception 'Only the league''s owner can change its tier.' using errcode = 'P0001', hint = 'not_owner';
  end if;

  delete from public.league_tiers t where t.league_id = l.id and t.from_season > now_at;
  if found then
    perform public.sync_league_tier(l.id);
    perform public.notify_league_tier(
      l.id, public.league_tier_at(l.id, now_at), 'cancelled', now_at + 1,
      l.id || ':cancelled:' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint, me
    );
    perform public.invoke_activity_push();
  end if;
end;
$$;

revoke execute on function public.cancel_tier_upgrade(uuid) from public, anon;
grant execute on function public.cancel_tier_upgrade(uuid) to authenticated;

-- Each of your leagues: the tier its next card plays (the card
-- my_league_pick_rules reads), the tier of the season being played, and a
-- move up that hasn't started. my_leagues keeps its shape for older builds.
create function public.my_league_tiers()
returns table (
  league_id   uuid,
  card_tier   public.league_tier,
  tier_now    public.league_tier,
  next_tier   public.league_tier,
  next_season integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with card as (
    select e.id from public.events e
    where e.status in ('scheduled', 'live')
    order by e.starts_at limit 1
  ),
  playing as (
    select public.season_in_play() as n
  )
  select m.league_id,
         case when exists (select 1 from card)
              then public.league_tier_for(m.league_id, (select c.id from card c))
              else public.league_tier_at(m.league_id, (select p.n from playing p)) end,
         public.league_tier_at(m.league_id, (select p.n from playing p)),
         up.tier, up.from_season
  from public.league_members m
  left join lateral (
    select t.tier, t.from_season from public.league_tiers t
    where t.league_id = m.league_id and t.from_season > (select p.n from playing p)
    order by t.from_season desc limit 1
  ) up on true
  where m.user_id = (select auth.uid()) and m.left_at is null;
$$;

revoke execute on function public.my_league_tiers() from public, anon;
grant execute on function public.my_league_tiers() to authenticated;

-------------------------------------------------------------------------------
-- When a season opens
-------------------------------------------------------------------------------

-- The tier now follows the new season, and the league hears it moved up.
-- Nothing here may stop a season from opening, so a failure is only a warning.
create function public.open_season_tiers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    for r in
      select l.id, public.league_tier_at(l.id, new.number) as tier
      from public.leagues l
      where public.league_tier_at(l.id, new.number) is distinct from l.tier
    loop
      perform public.sync_league_tier(r.id);
      perform public.notify_league_tier(r.id, r.tier, 'started', new.number, r.id || ':started:' || new.number);
    end loop;
    if found then
      perform public.invoke_activity_push();
    end if;
  exception when others then
    raise warning 'open_season_tiers: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.open_season_tiers() from public, anon, authenticated;

create trigger seasons_open_tiers after insert on public.seasons
  for each row when (new.starts_at is not null)
  execute function public.open_season_tiers();

create trigger seasons_open_tiers_on_start after update of starts_at on public.seasons
  for each row when (old.starts_at is null and new.starts_at is not null)
  execute function public.open_season_tiers();

-------------------------------------------------------------------------------
-- The inbox
-------------------------------------------------------------------------------

-- Every kind, for this build on. Builds before it show a kind they don't know
-- as "You have a new notification", so the RPCs they call leave tier news out.
create function public.inbox_items_v4(max_rows integer default 50)
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
      then jsonb_set(n.payload, '{member}', to_jsonb(public.hidden_name(split_part(n.key, ':', 2)::uuid)))
      when n.kind = 'matchup'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 3)
       )
      then jsonb_set(n.payload, '{opponent}', '"Blocked player"')
      when n.kind = 'matchup' and public.name_hidden(split_part(n.key, ':', 3)::uuid)
      then jsonb_set(n.payload, '{opponent}', to_jsonb(public.hidden_name(split_part(n.key, ':', 3)::uuid)))
      else n.payload
    end,
    n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;

create function public.inbox_unread_count_v4()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

-- The build before this one. inbox_items_v2, inbox_items and my_notifications
-- read through it, so they leave tier news out too.
create or replace function public.inbox_items_v3(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items_v4(200) with ordinality i
  where i.kind <> 'tier'
  order by i.ordinality
  limit least(greatest(max_rows, 1), 200);
$$;

create or replace function public.inbox_unread_count_v3()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind <> 'tier';
$$;

create or replace function public.inbox_unread_count_v2()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null
    and n.kind not in ('name_restored', 'name_kept', 'tier');
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
    and n.kind not in ('poll', 'name_restored', 'name_kept', 'tier');
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
    and n.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank', 'poll', 'name_restored', 'name_kept', 'tier');
$$;

revoke execute on function public.inbox_items_v4(integer), public.inbox_unread_count_v4() from public, anon;
grant execute on function public.inbox_items_v4(integer), public.inbox_unread_count_v4() to authenticated;

-------------------------------------------------------------------------------
-- Every card at its own season's tier
-------------------------------------------------------------------------------

-- As before, with the tier read for the card (or the season) instead of the
-- league's tier now.

create or replace function public.league_matchup_picks(league uuid, event uuid, a uuid, b uuid)
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

  t := public.league_tier_for(league, event);

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

create or replace function public.matchup_picks(league uuid, event uuid, opponent uuid)
returns table (
  bout_id         uuid,
  fight_order     smallint,
  card_segment    public.card_segment,
  -- The bout's section has started, so picks on it are final.
  locked          boolean,
  -- A fighter was replaced after the lock: no fight for anyone.
  voided          boolean,
  red_id          uuid,
  red_name        text,
  blue_id         uuid,
  blue_name       text,
  my_fighter      uuid,
  my_finish       public.finish_kind,
  my_round        smallint,
  my_method       public.pick_method,
  my_points       integer,
  their_fighter   uuid,
  their_finish    public.finish_kind,
  their_round     smallint,
  their_method    public.pick_method,
  their_points    integer,
  their_locked_in boolean
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
  if not public.shares_league(league, opponent) then
    raise exception 'That player isn''t in this league.' using errcode = 'P0001', hint = 'not_member';
  end if;

  t := public.league_tier_for(league, event);

  return query
  with card as (
    select b.*,
           coalesce(b.locks_at, e.locks_at) <= now() as is_locked,
           public.changed_after_lock(b.id) as is_void
    from public.bouts b
    join public.events e on e.id = b.event_id
    where b.event_id = event and b.status = 'scheduled'
      and public.bout_counts_for_tier(t, b.id)
  ),
  -- Only picks made against the bout as it stands: one from before a
  -- fighter was replaced no longer applies.
  side as (
    select c.id as bout, k.user_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           (select case when t = 'casual' then s.casual_points else s.points end
            from public.scores s where s.user_id = k.user_id and s.bout_id = c.id) as pts
    from card c
    join public.picks k on k.bout_id = c.id and k.bout_version = c.version
    where k.user_id in (me, opponent)
  )
  select c.id, c.fight_order, c.card_segment, c.is_locked, c.is_void,
         c.red_fighter_id, rf.name, c.blue_fighter_id, bf.name,
         mine.picked_fighter_id, mine.finish, mine.finish_round, mine.method, mine.pts,
         theirs.picked_fighter_id, theirs.finish, theirs.finish_round, theirs.method, theirs.pts,
         public.met_league_picks(league, opponent, event)
  from card c
  join public.fighters rf on rf.id = c.red_fighter_id
  join public.fighters bf on bf.id = c.blue_fighter_id
  left join side mine on mine.bout = c.id and mine.user_id = me
  -- Nothing of theirs on a bout that hasn't locked, not even whether it's picked.
  left join side theirs on theirs.bout = c.id and theirs.user_id = opponent and c.is_locked
  order by c.fight_order;
end;
$$;

create or replace function public.league_season_totals(league uuid, season uuid)
returns table (user_id uuid, points integer, correct integer, counted integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t        public.league_tier;
  floored  boolean;
  carries  boolean;
  r        record;
  cur      uuid;
  total    integer;
  debt     integer;
  before   integer;
  pts      integer;
  paid     integer;
begin
  t := public.league_season_tier(league, season);
  floored := t in ('casual', 'amateur');
  carries := t = 'amateur';

  for r in
    select s.user_id as uid,
           case when t = 'casual' then s.casual_points else s.points end as raw,
           s.breakdown, s.correct as hit, s.counts_for_accuracy as counts
    from public.league_members m
    join public.scores s on s.user_id = m.user_id
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where m.league_id = league
      and e.season_id is not distinct from season
      -- Only the part of the card the league's tier plays.
      and public.bout_counts_for_tier(t, b.id)
      -- The pre-season counts from when you joined the league.
      and (season is not null or e.locks_at >= m.joined_at)
    order by s.user_id, e.starts_at, e.id, b.fight_order desc
  loop
    if cur is distinct from r.uid then
      if cur is not null then
        user_id := cur; points := total; return next;
      end if;
      cur := r.uid; total := 0; debt := 0; correct := 0; counted := 0;
    end if;

    before := total;
    pts := r.raw;
    if pts > 0 and debt > 0 then
      paid := least(debt, pts);
      debt := debt - paid;
      pts := pts - paid;
    end if;
    if carries and before = 0 and r.raw < 0
       and (r.breakdown->>'fighter')::integer <= 0
       and (r.breakdown->>'method')::integer <= 0
       and (r.breakdown->>'round')::integer <= 0 then
      debt := 20;
    end if;
    total := case when floored then greatest(0, total + pts) else total + pts end;

    if r.counts then
      counted := counted + 1;
      if r.hit then correct := correct + 1; end if;
    end if;
  end loop;

  if cur is not null then
    user_id := cur; points := total; return next;
  end if;
end;
$$;

create or replace function public.league_schedule(league uuid, season uuid)
returns table (
  week        integer,
  event_id    uuid,
  event_name  text,
  state       text,
  user_a      uuid,
  name_a      text,
  points_a    integer,
  user_b      uuid,
  name_b      text,
  points_b    integer,
  winner      uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.league_tier;
begin
  t := public.league_season_tier(league, season);

  return query
  with
  pairs as (
    select p.week as w, p.card_id as id, p.card_name as name, p.card_status as status,
           p.card_locks_at as locks_at, p.user_a as ua, p.user_b as ub
    from public.league_pairings(league, season) p
  ),
  card_points as (
    select b.event_id, s.user_id,
           sum(case when t = 'casual' then s.casual_points else s.points end)::integer as pts,
           bool_or(s.provisional) as provisional
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    where b.event_id in (select p.id from pairs p where p.id is not null)
      -- Only the part of the card the league's tier plays.
      and public.bout_counts_for_tier(t, b.id)
    group by b.event_id, s.user_id
  ),
  scored as (
    select p.*,
           case
             when p.id is null or p.locks_at > now() then 'upcoming'
             when p.status = 'complete'
                  and not exists (
                    select 1 from card_points cp where cp.event_id = p.id and cp.provisional
                  ) then 'final'
             else 'live'
           end as st,
           coalesce((select cp.pts from card_points cp where cp.event_id = p.id and cp.user_id = p.ua), 0) as pa,
           case when p.ub is null then null
                else coalesce((select cp.pts from card_points cp where cp.event_id = p.id and cp.user_id = p.ub), 0)
           end as pb,
           public.met_league_picks(league, p.ua, p.id) as played_a,
           p.ub is not null and public.met_league_picks(league, p.ub, p.id) as played_b
    from pairs p
  )
  select s.w, s.id, s.name, s.st,
         s.ua, public.league_display_name(s.ua), case when s.st = 'upcoming' then null else s.pa end,
         s.ub, public.league_display_name(s.ub), case when s.st = 'upcoming' then null else s.pb end,
         case
           when s.st <> 'final' or s.ub is null then null
           -- Missing the picks the tier requires (no picks at all included)
           -- loses, whatever the other side scored; both missing them is a
           -- draw.
           when not s.played_a and not s.played_b then null
           when s.played_a and not s.played_b then s.ua
           when s.played_b and not s.played_a then s.ub
           when s.pa = s.pb then null
           when s.pa > s.pb then s.ua
           else s.ub
         end
  from scored s;
end;
$$;

create or replace function public.league_required_bouts(league uuid, event uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with lg as (
    select public.league_tier_for(league, event) as tier
  ),
  rule as (
    select r.scope, r.top_n
    from public.events e, public.league_pick_rule(league, e.locks_at) r
    where e.id = event
  ),
  counted as (
    select b.id, b.card_segment, public.changed_after_lock(b.id) as changed,
           row_number() over (order by b.fight_order) as at_lock
    from public.bouts b, lg
    where b.event_id = event and b.status = 'scheduled'
      and public.bout_counts_for_tier(lg.tier, b.id)
  ),
  card as (
    select c.*, row_number() over (order by c.at_lock) as pos
    from counted c where not c.changed
  )
  select c.id from card c, lg, rule r
  where case
    when lg.tier in ('casual', 'amateur') then true
    when r.scope = 'whole_card' then true
    -- A bout entered by hand has no segment and counts as main card.
    when r.scope = 'main_card' then c.card_segment = 'main' or c.card_segment is null or c.pos = 1
    when r.scope = 'top_n' then c.at_lock <= r.top_n or c.pos = 1
    else c.pos = 1
  end;
$$;

create or replace function public.set_league_pick_rule(league uuid, scope text, top_n smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l  public.leagues%rowtype;
begin
  select * into l from public.leagues x where x.id = set_league_pick_rule.league;
  if not found or l.owner_id is distinct from me then
    raise exception 'Only the league''s owner can change its rules.' using errcode = 'P0001', hint = 'not_owner';
  end if;
  -- Pro now, or moving up to it: the minimum can be set before the season starts.
  if public.league_tier_at(l.id, 2147483647) not in ('pro', 'hardcore') then
    raise exception 'Only Pro leagues set their own minimum picks.' using errcode = 'P0001', hint = 'invalid';
  end if;
  if scope is null or scope not in ('main_event', 'main_card', 'whole_card', 'top_n') then
    raise exception 'Pick a minimum.' using errcode = 'P0001', hint = 'invalid';
  end if;
  if scope = 'top_n' and (top_n is null or top_n not between 2 and 20) then
    raise exception 'Pick between 2 and 20 fights.' using errcode = 'P0001', hint = 'invalid';
  end if;

  insert into public.league_pick_rules (league_id, effective_at, scope, top_n, set_by)
  values (l.id, clock_timestamp(), scope, case when scope = 'top_n' then top_n end, me);
end;
$$;

create or replace function public.compute_award_drop(drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
  champ text;
begin
  select * into d from public.award_drops x where x.id = compute_award_drop.drop;
  champ := case when d.kind = 'final' then 'champ' else 'interim_champ' end;

  delete from public.drop_awards a where a.drop_id = d.id;
  delete from public.drop_stats s where s.drop_id = d.id;

  -- A results sync that failed to save a card's weeks would leave it out of
  -- the table. settle_event is safe to run again.
  perform public.settle_event(e.id)
  from public.events e
  where e.season_id is not distinct from d.season_id
    and e.locks_at <= d.ran_at
    and public.event_is_final(e.id)
    and not exists (select 1 from public.league_results r where r.event_id = e.id);

  -- Stats, per player per scope.
  insert into public.drop_stats (drop_id, scope, user_id, stats)
  with cards as (
    select e.id, e.locks_at from public.events e
    where e.season_id is not distinct from d.season_id
      and e.locks_at <= d.ran_at
      and public.event_is_final(e.id)
  ),
  base as (
    select k.user_id, b.event_id, c.locks_at, b.id as bout_id,
           k.finish = 'round' or k.method is not null as finish_call,
           k.finish = 'DEC' as dec_call,
           k.finish = 'round' as round_call,
           b.underdog_corner is not null as has_dog,
           b.underdog_corner is not null
             and (case when k.picked_fighter_id = b.red_fighter_id then 'red' else 'blue' end) = b.underdog_corner::text
             as dog_pick,
           s.correct, s.points,
           -- Called with the right fighter: a wrong fighter still earns a
           -- little for the method, which isn't calling how it ends.
           s.correct and coalesce((s.breakdown->>'method')::int, 0) > 0 as method_right,
           coalesce((s.breakdown->>'round')::int, 0) > 0 as round_right
    from public.picks k
    join public.bouts b on b.id = k.bout_id and k.bout_version = b.version and b.status = 'scheduled'
    join cards c on c.id = b.event_id
    join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id and s.counts_for_accuracy
    join public.profiles p on p.id = k.user_id
    where p.deleted_at is null
      and (select ps.standing from public.player_standing(k.user_id) ps) is distinct from 'banned'
  ),
  scoped as (
    select 'global'::text as scope, b.* from base b
    union all
    select l.id::text, b.*
    from base b
    join public.league_members m on m.user_id = b.user_id
    join public.leagues l on l.id = m.league_id
    where m.joined_at <= b.locks_at
      and (m.left_at is null or m.left_at > b.locks_at)
      and public.bout_counts_for_tier(public.league_tier_for(l.id, b.event_id), b.bout_id)
  ),
  per_card as (
    select scope, user_id, event_id, count(*) as n, bool_and(correct) as clean
    from scoped group by scope, user_id, event_id
  ),
  -- Where each player finished on each card in a league: last on a card
  -- of 3 or more, ties included.
  card_points as (
    select s.scope, s.user_id, s.event_id, sum(s.points) as pts
    from scoped s where s.scope <> 'global'
    group by s.scope, s.user_id, s.event_id
  ),
  last_on_card as (
    select z.scope, z.user_id, count(*) as n
    from (
      select c.*, count(*) over (partition by c.scope, c.event_id) as field,
             min(c.pts) over (partition by c.scope, c.event_id) as low
      from card_points c
    ) z
    where z.field >= 3 and z.pts = z.low
    group by z.scope, z.user_id
  ),
  -- Settled takes on the drop's cards, by the same players.
  settled_polls as materialized (
    select cp.id, c.locks_at, o.outcome
    from public.community_polls cp
    join cards c on c.id = cp.event_id
    cross join lateral (select public.poll_outcome(cp.id) as outcome) o
    where o.outcome is not null and o.outcome <> 'void'
  ),
  takes as (
    select v.user_id, sp.locks_at, v.option = sp.outcome as right_call
    from settled_polls sp
    join public.poll_votes v on v.poll_id = sp.id
    join public.profiles p on p.id = v.user_id
    where p.deleted_at is null
      and (select ps.standing from public.player_standing(v.user_id) ps) is distinct from 'banned'
  ),
  takes_scoped as (
    select 'global'::text as scope, t.user_id, t.right_call from takes t
    union all
    select m.league_id::text, t.user_id, t.right_call
    from takes t
    join public.league_members m on m.user_id = t.user_id
    where m.joined_at <= t.locks_at
      and (m.left_at is null or m.left_at > t.locks_at)
  ),
  takes_totals as (
    select t.scope, t.user_id, count(*) as n, count(*) filter (where t.right_call) as right_calls
    from takes_scoped t group by t.scope, t.user_id
  ),
  totals as (
    select s.scope, s.user_id,
           count(*) as picks,
           count(distinct s.event_id) as cards,
           count(*) filter (where s.correct) as hits,
           count(*) filter (where s.finish_call) as finish_calls,
           count(*) filter (where s.dec_call) as dec_calls,
           count(*) filter (where s.has_dog) as dog_fights,
           count(*) filter (where s.has_dog and not s.dog_pick) as fav_picks,
           count(*) filter (where s.dog_pick and s.correct) as dog_hits,
           count(*) filter (where s.round_call) as round_calls,
           count(*) filter (where s.round_right) as rounds_right,
           count(*) filter (where s.method_right) as methods_right,
           max(s.points) as best_call,
           sum(s.points) as points
    from scoped s group by s.scope, s.user_id
  )
  select d.id, t.scope, t.user_id,
         jsonb_build_object(
           'picks', t.picks, 'cards', t.cards, 'hits', t.hits,
           'finish_calls', t.finish_calls, 'dec_calls', t.dec_calls,
           'dog_fights', t.dog_fights, 'fav_picks', t.fav_picks, 'dog_hits', t.dog_hits,
           'round_calls', t.round_calls, 'rounds_right', t.rounds_right, 'methods_right', t.methods_right,
           'best_call', t.best_call, 'points', t.points,
           'perfect_cards', (select count(*) from per_card pc
                             where pc.scope = t.scope and pc.user_id = t.user_id and pc.n >= 5 and pc.clean),
           'picks_per_card', round(t.picks::numeric / t.cards, 2),
           'last_cards', coalesce((select lc.n from last_on_card lc where lc.scope = t.scope and lc.user_id = t.user_id), 0),
           'takes', coalesce(tt.n, 0),
           'takes_right', coalesce(tt.right_calls, 0)
         )
  from totals t
  left join takes_totals tt on tt.scope = t.scope and tt.user_id = t.user_id;

  -- Each league's saved matchups this season, from each side. Working tables
  -- for this call, like award_values below.
  drop table if exists pg_temp.stored_games;
  create temp table stored_games on commit drop as
  select r.league_id, r.event_id, e.locks_at, x.uid, x.opp, x.pts,
         case when r.winner = x.uid then 'W' when r.winner = x.opp then 'L' else 'D' end as outcome,
         r.winner = x.uid and not public.met_league_picks(r.league_id, x.opp, r.event_id) as forfeit
  from public.league_results r
  join public.events e on e.id = r.event_id
  cross join lateral (values (r.user_a, r.user_b, r.points_a), (r.user_b, r.user_a, r.points_b)) as x(uid, opp, pts)
  where r.season_id is not distinct from d.season_id
    and e.locks_at <= d.ran_at;

  drop table if exists pg_temp.stored_table;
  create temp table stored_table on commit drop as
  with rec as (
    select g.league_id, g.uid,
           count(*) filter (where g.outcome = 'W')::integer as wins,
           count(*) filter (where g.forfeit)::integer as forfeit_wins,
           count(*) filter (where g.outcome = 'L')::integer as losses,
           count(*) filter (where g.outcome = 'D')::integer as draws,
           count(distinct g.event_id)::integer as weeks
    from stored_games g group by g.league_id, g.uid
  ),
  -- A doubleheader saves the card's points on both matchups; count them once.
  card_pts as (
    select c.league_id, c.uid, sum(c.pts)::integer as points
    from (select distinct g.league_id, g.uid, g.event_id, g.pts from stored_games g) c
    group by c.league_id, c.uid
  ),
  -- The longest stretch between losses, a card's wins and draws before its loss.
  runs as (
    select g.league_id, g.uid, g.outcome,
           count(*) filter (where g.outcome = 'L') over (
             partition by g.league_id, g.uid
             order by g.locks_at, g.event_id, g.outcome = 'L', g.opp
             rows unbounded preceding
           ) as breaks
    from stored_games g
  ),
  unbeaten as (
    select z.league_id, z.uid, max(z.n)::integer as best
    from (
      select r.league_id, r.uid, r.breaks, count(*) filter (where r.outcome <> 'L') as n
      from runs r group by r.league_id, r.uid, r.breaks
    ) z
    group by z.league_id, z.uid
  ),
  keyed as (
    select rc.*, cp.points, coalesce(u.best, 0) as unbeaten_run,
           (3 * (rc.wins - rc.forfeit_wins) + 1.5 * rc.forfeit_wins + rc.draws)::numeric
             / (rc.wins + rc.losses + rc.draws) as pct,
           coalesce((ds.stats->>'hits')::numeric / nullif((ds.stats->>'picks')::numeric, 0), 0) as acc,
           ds.user_id is not null
             and exists (select 1 from public.league_members m
                         where m.league_id = rc.league_id and m.user_id = rc.uid and m.left_at is null
                           and (d.season_id is null or m.status = 'active')) as ranked
    from rec rc
    join card_pts cp on cp.league_id = rc.league_id and cp.uid = rc.uid
    left join unbeaten u on u.league_id = rc.league_id and u.uid = rc.uid
    left join public.drop_stats ds
      on ds.drop_id = d.id and ds.scope = rc.league_id::text and ds.user_id = rc.uid
  ),
  -- Head to head: net wins over the ranked players level on everything else.
  h2h as (
    select k.*,
           case when k.ranked then (
             select coalesce(sum(case g.outcome when 'W' then 1 when 'L' then -1 else 0 end), 0)
             from stored_games g
             join keyed o on o.league_id = g.league_id and o.uid = g.opp
             where g.league_id = k.league_id and g.uid = k.uid and o.ranked
               and o.pct = k.pct and o.points = k.points and o.acc = k.acc
           ) else 0 end as h2h
    from keyed k
  )
  select k.*,
         case when k.ranked then rank() over (
           partition by k.league_id, k.ranked order by k.pct desc, k.points desc, k.acc desc, k.h2h desc
         ) end as rank
  from h2h k;

  -- Leagues: the table and where it's heading. Projections go over the
  -- weeks each player played (a late joiner's few weeks project like
  -- anyone's), so an odd league's doubleheaders count, over an 11-card
  -- season.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object(
    'rank', t.rank, 'wins', t.wins, 'losses', t.losses, 'draws', t.draws, 'forfeit_wins', t.forfeit_wins,
    'league_points', t.points, 'unbeaten_run', t.unbeaten_run,
    'projected', case when t.weeks > 0 then jsonb_build_object(
      'wins', round(t.wins::numeric / t.weeks * 11),
      'losses', round(t.losses::numeric / t.weeks * 11),
      'draws', round(t.draws::numeric / t.weeks * 11),
      'points', round(t.points::numeric / t.weeks * 11)
    ) end
  )
  from stored_table t
  where ds.drop_id = d.id and ds.scope = t.league_id::text and ds.user_id = t.uid;

  -- Each award's value per player, where they qualify. A working table for
  -- this call; a preview just before a run leaves one behind.
  drop table if exists pg_temp.award_values;
  create temp table award_values on commit drop as
  with s as (
    select ds.scope, ds.user_id, ds.stats,
           (ds.stats->>'picks')::numeric as picks, (ds.stats->>'cards')::numeric as cards
    from public.drop_stats ds where ds.drop_id = d.id
  ),
  medians as (
    select s.scope, percentile_cont(0.5) within group (order by (s.stats->>'picks_per_card')::numeric) as ppc
    from s group by s.scope
  ),
  v as (
    select s.scope, s.user_id, x.award, x.value, x.tiebreak,
           x.ok and (x.award = 'gun_shy' or (s.picks >= 8 and s.cards >= 2)) as ok
    from s
    join medians md on md.scope = s.scope
    cross join lateral (values
      ('finisher', (s.stats->>'finish_calls')::numeric / s.picks, (s.stats->>'finish_calls')::numeric, true),
      ('judge', (s.stats->>'dec_calls')::numeric / s.picks, (s.stats->>'dec_calls')::numeric, true),
      ('chalk', (s.stats->>'fav_picks')::numeric / nullif((s.stats->>'dog_fights')::numeric, 0),
         (s.stats->>'fav_picks')::numeric, (s.stats->>'dog_fights')::numeric >= 4),
      ('dog', (s.stats->>'dog_hits')::numeric, (s.stats->>'dog_hits')::numeric / nullif((s.stats->>'dog_fights')::numeric, 0),
         (s.stats->>'dog_hits')::numeric >= 1),
      ('sniper', (s.stats->>'rounds_right')::numeric / nullif((s.stats->>'round_calls')::numeric, 0),
         (s.stats->>'rounds_right')::numeric, (s.stats->>'round_calls')::numeric >= 3 and (s.stats->>'rounds_right')::numeric >= 1),
      ('ice_cold', (s.stats->>'perfect_cards')::numeric, s.picks, (s.stats->>'perfect_cards')::numeric >= 1),
      ('sharpshooter', (s.stats->>'hits')::numeric / s.picks, (s.stats->>'hits')::numeric, true),
      ('method_man', (s.stats->>'methods_right')::numeric, s.picks, (s.stats->>'methods_right')::numeric >= 1),
      ('iron_man', s.picks, s.cards, true),
      ('call_of_night', (s.stats->>'best_call')::numeric, s.picks, (s.stats->>'best_call')::numeric > 0),
      ('oracle', (s.stats->>'takes_right')::numeric / nullif((s.stats->>'takes')::numeric, 0),
         (s.stats->>'takes')::numeric, (s.stats->>'takes')::numeric >= 5),
      ('iron_chin', (s.stats->>'unbeaten_run')::numeric, (s.stats->>'wins')::numeric,
         s.scope <> 'global' and (s.stats->>'unbeaten_run')::numeric >= 3),
      -- The joke one: far fewer fights a card than everyone else. Lower wins,
      -- so it's ranked on the negative.
      -- Another joke: last in the league on the most cards, at least 2.
      ('pro_can', (s.stats->>'last_cards')::numeric, -(s.stats->>'points')::numeric,
         s.scope <> 'global' and (s.stats->>'last_cards')::numeric >= 2),
      ('gun_shy', -(s.stats->>'picks_per_card')::numeric, -s.picks,
         s.cards >= 2 and (s.stats->>'picks_per_card')::numeric <= md.ppc / 2)
    ) as x(award, value, tiebreak, ok)
  )
  select v.*, rank() over (partition by v.scope, v.award order by v.value desc, v.tiebreak desc nulls last) as place
  from v where v.ok and v.value is not null;

  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, av.scope, av.award, av.user_id,
         case when av.award = 'gun_shy' then -av.value else av.value end
  from award_values av where av.place = 1;

  -- Each player's place in every category, for their profile.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object('places', (
    select coalesce(jsonb_object_agg(av.award, av.place), '{}'::jsonb)
    from award_values av where av.scope = ds.scope and av.user_id = ds.user_id and av.award not in ('gun_shy', 'pro_can')
  ))
  where ds.drop_id = d.id;

  -- League #1: Interim Champ at a review, Champ at a final one.
  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, ds.scope, champ, ds.user_id, null
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope <> 'global' and (ds.stats->>'rank')::int = 1;

  -- Global: P4P by edge, rankable players only.
  update public.drop_stats ds set stats = ds.stats || jsonb_build_object('p4p_rank', lb.rank, 'edge', lb.edge)
  from public.season_leaderboard(100000) lb
  where ds.drop_id = d.id and ds.scope = 'global' and lb.user_id = ds.user_id and lb.rank is not null;

  insert into public.drop_awards (drop_id, scope, award, user_id, value)
  select d.id, 'global', 'p4p', ds.user_id, (ds.stats->>'edge')::numeric
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope = 'global' and (ds.stats->>'p4p_rank')::int = 1;
end;
$$;

create or replace function public.league_card(league uuid, me uuid, event uuid, kind text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lg as (
    select l.id, l.name, public.league_tier_for(l.id, e.id) as tier, e.name as event_name, coalesce(min(coalesce(b.locks_at, e.locks_at)), e.locks_at) as lock_at
    from public.leagues l, public.events e
    left join public.bouts b on b.event_id = e.id and b.status = 'scheduled'
    where l.id = league and e.id = event
    group by l.id, l.name, e.id, e.name, e.locks_at
  ),
  out_ as (
    select x.user_id from public.sidelined_players() x
  ),
  -- Members on the card when it locked, on the fights the league's tier plays.
  picks as (
    select k.user_id, k.bout_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           s.points, s.correct, b.red_fighter_id, r.method as r_method, r.round as r_round
    from lg
    join public.league_members m on m.league_id = lg.id
      and m.joined_at <= lg.lock_at and (m.left_at is null or m.left_at > lg.lock_at)
    join public.picks k on k.user_id = m.user_id
    join public.bouts b on b.id = k.bout_id and b.event_id = event and b.status = 'scheduled'
      and k.bout_version = b.version and public.bout_counts_for_tier(lg.tier, b.id)
    join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id
    left join public.results r on r.bout_id = b.id
    where not exists (select 1 from out_ o where o.user_id = m.user_id)
  ),
  totals as (
    select p.user_id, sum(p.points)::int as points from picks p group by p.user_id
  ),
  crafty as (
    select p.*, f.name as fighter,
           count(*) over (partition by p.bout_id, p.picked_fighter_id) as with_them,
           count(*) over (partition by p.bout_id) as on_fight
    from picks p join public.fighters f on f.id = p.picked_fighter_id
  ),
  craftiest as (
    select c.* from crafty c
    where c.correct and c.with_them < c.on_fight
    order by c.with_them::numeric / c.on_fight,
             ((c.finish = 'DEC' and c.r_method = 'DEC')
              or (c.finish = 'round' and c.finish_round = c.r_round and c.method::text = c.r_method::text)) desc,
             c.points desc
    limit 1
  )
  select jsonb_build_object(
    'type', 'league',
    'kind', kind,
    'league_name', lg.name,
    'event_name', lg.event_name,
    'players', (select count(*) from totals),
    'pick', case kind
      when 'craftiest' then (
        select jsonb_build_object('name', public.league_display_name(c.user_id), 'is_me', c.user_id = me,
                                  'fighter', c.fighter, 'finish', c.finish, 'finish_round', c.finish_round,
                                  'method', c.method, 'points', c.points,
                                  'with_them', c.with_them, 'on_fight', c.on_fight)
        from craftiest c)
      when 'jobber' then (
        select jsonb_build_object('name', public.league_display_name(t.user_id), 'is_me', t.user_id = me, 'points', t.points)
        from (select t.*, row_number() over (order by t.points desc, t.user_id) as place from totals t) t
        where t.place = ((select count(*) from totals) + 1) / 2)
      else (
        select jsonb_build_object('name', public.league_display_name(t.user_id), 'is_me', t.user_id = me, 'points', t.points)
        from totals t
        order by case when kind = 'losers' then t.points else -t.points end, t.user_id
        limit 1)
      end
  )
  from lg
  where (select count(*) from totals) >= case when kind = 'jobber' then 5 else 3 end
    and (kind <> 'craftiest' or exists (select 1 from craftiest));
$$;

-- The tier column is the tier the league's next card plays, which is what
-- builds before my_league_tiers use it for: the picks a card requires. It
-- differs from the tier now only between a season's last card and the next
-- season's first, after a move up.
create or replace function public.my_leagues()
returns table (
  league_id    uuid,
  name         text,
  tier         public.league_tier,
  invite_code  text,
  is_owner     boolean,
  members      integer,
  my_status    text,
  my_rank      bigint,
  wins         integer,
  losses       integer,
  draws        integer,
  points       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with card as (
    select e.id from public.events e
    where e.status in ('scheduled', 'live')
    order by e.starts_at limit 1
  )
  select l.id, l.name,
         coalesce(public.league_tier_for(l.id, (select c.id from card c)), l.tier),
         l.invite_code, l.owner_id = (select auth.uid()),
         (select count(*)::integer from public.league_members x
           where x.league_id = l.id and x.left_at is null),
         me.status, me.rank, me.wins, me.losses, me.draws, me.points
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  cross join lateral (
    select s.status, s.rank, s.wins, s.losses, s.draws, s.points
    from public.league_standings(l.id) s where s.is_me
  ) me
  where m.user_id = (select auth.uid()) and m.left_at is null
  order by m.joined_at;
$$;

-- As before, with the tier the next card plays, so someone joining just
-- before a move up reads the rules they'll play.
create or replace function public.league_preview(code text)
returns table (
  name           text,
  tier           public.league_tier,
  members        int,
  max_members    int,
  scope          text,
  top_n          smallint,
  already_member boolean,
  queued         boolean,
  is_full        boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  season uuid := public.current_season();
  cap    int := (select x.max_members::int from public.league_limits() x);
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001', hint = 'not_signed_in';
  end if;
  perform public.require_good_standing(uid);
  perform public.check_input_limit(uid, 'invite_code');
  if not exists (select 1 from public.leagues l where l.invite_code = lower(btrim(coalesce(code, '')))) then
    perform public.record_input_attempt(uid, 'invite_code');
    return;
  end if;

  return query
  with card as (
    select e.id, e.locks_at from public.events e
    where e.status = 'scheduled' and e.locks_at > now()
    order by e.locks_at limit 1
  ),
  lg as (
    select l.id, l.name, coalesce(public.league_tier_for(l.id, (select c.id from card c)), l.tier) as tier
    from public.leagues l
    where l.invite_code = lower(btrim(coalesce(code, '')))
  )
  select lg.name,
         lg.tier,
         (select count(*)::int from public.league_members m
          where m.league_id = lg.id
            and case when season is not null then m.status = 'active' else m.left_at is null end),
         cap,
         case when lg.tier in ('pro', 'hardcore') then r.scope end,
         case when lg.tier in ('pro', 'hardcore') then r.top_n end,
         exists (select 1 from public.league_members m
                 where m.league_id = lg.id and m.user_id = uid and m.left_at is null),
         season is not null,
         (select count(*)::int from public.league_members m where m.league_id = lg.id and m.left_at is null) >= cap
  from lg
  cross join lateral public.league_pick_rule(
    lg.id, coalesce((select c.locks_at from card c), 'infinity'::timestamptz)
  ) r;
end;
$$;
