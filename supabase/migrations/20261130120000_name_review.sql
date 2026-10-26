-- Hidden names get a tag, and a hidden player can rename on the spot.
--
-- A name hidden by reports showed as "Player", so two hidden players in one
-- league couldn't be told apart, and renaming didn't help because the hiding
-- followed the open case. Now:
--
--   * Every case gets a random tag, and while a name is hidden everyone else
--     sees "Player #4821", the same everywhere for as long as the case is
--     open. The number is random, never derived from the account. Former
--     members are tagged the same way.
--   * The name a player had when it got hidden is held on the case. A new
--     name shows straight away, the first rename in a case skips the weekly
--     limit, and nobody else can take the held name while the case is open.
--   * Dismissing the case puts the held name back, without starting the
--     weekly limit, and frees the new one. Any action against the name
--     retires the held one for good; a player who renamed keeps the new one.

-------------------------------------------------------------------------------
-- What a case holds
-------------------------------------------------------------------------------

alter table public.moderation_cases
  -- Shown as "Player #<alias>" while the name is hidden.
  add column alias      smallint check (alias between 1000 and 9999),
  -- The player's name when the case hid it.
  add column held_name  text,
  -- When the player used the rename that skips the weekly limit.
  add column renamed_at timestamptz;

create index moderation_cases_held_idx on public.moderation_cases (lower(held_name))
  where status = 'open' and held_name is not null;

-- A random tag that no open case and none of the player's earlier cases use,
-- so two hidden players never share one and a new case reads differently.
create function public.new_case_alias(player uuid)
returns smallint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pick smallint;
begin
  for attempt in 1..50 loop
    pick := (1000 + floor(random() * 9000))::smallint;
    exit when not exists (
      select 1 from public.moderation_cases c
      where c.alias = pick and (c.status = 'open' or c.player = new_case_alias.player)
    );
  end loop;
  return pick;
end;
$$;

create function public.set_case_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.alias := coalesce(new.alias, public.new_case_alias(new.player));
  return new;
end;
$$;

create trigger moderation_cases_alias before insert on public.moderation_cases
  for each row execute function public.set_case_alias();

do $$
declare
  c record;
begin
  for c in select id, player from public.moderation_cases order by id loop
    update public.moderation_cases set alias = public.new_case_alias(c.player) where id = c.id;
  end loop;
end;
$$;

alter table public.moderation_cases alter column alias set not null;

-- A deleted account with no case gets its tag when it's deleted.
alter table public.profiles add column former_alias smallint check (former_alias between 1000 and 9999);

create function public.set_former_alias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and new.former_alias is null then
    new.former_alias := (1000 + floor(random() * 9000))::smallint;
  end if;
  return new;
end;
$$;

create trigger profiles_former_alias before update of deleted_at on public.profiles
  for each row execute function public.set_former_alias();

update public.profiles set former_alias = (1000 + floor(random() * 9000))::smallint
where deleted_at is not null and former_alias is null;

-- Names a moderator found broke the rules. Nobody can take one again, the
-- player who had it included. Stored lowercased.
create table public.retired_names (
  name_key   text primary key check (name_key = lower(name_key)),
  case_id    bigint references public.moderation_cases (id) on delete set null,
  retired_at timestamptz not null default now()
);

-- Read only through the name checks.
alter table public.retired_names enable row level security;
revoke all on public.retired_names from anon, authenticated;

-------------------------------------------------------------------------------
-- When a name is hidden
-------------------------------------------------------------------------------

-- True when an open case has enough established reporters to hide its
-- player's name, counting only reports of `name` when one is given. A
-- moderator's name is never hidden.
create function public.case_hides(case_id bigint, name text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.moderation_cases c
    join public.profiles p on p.id = c.player
    where c.id = case_hides.case_id and c.status = 'open' and not p.is_moderator
      and (
        select count(distinct r.reporter_id) from public.name_reports r
        where r.case_id = c.id and public.reporter_established(r.reporter_id)
          and (case_hides.name is null or lower(r.display_name) = lower(case_hides.name))
      ) >= public.auto_hide_threshold()
  );
$$;

-- As before, until the player renames: a new name shows at once, unless
-- enough established reporters report that one too.
create or replace function public.name_hidden(player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.moderation_cases c
    join public.profiles p on p.id = c.player
    where c.player = name_hidden.player and c.status = 'open'
      and case
        when c.held_name is null or lower(p.display_name) is not distinct from lower(c.held_name)
          then public.case_hides(c.id)
        else public.case_hides(c.id, p.display_name)
      end
  );
$$;

-- "Player #4821" while `player`'s name is hidden, else null.
create function public.hidden_name(player uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'Player #' || c.alias
  from public.moderation_cases c
  where c.player = hidden_name.player and c.status = 'open' and public.name_hidden(hidden_name.player);
$$;

-- "Former Member #4821": the tag of the player's latest case, or the one
-- given when the account was deleted.
create function public.former_name(player uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'Former Member' || coalesce(' #' || coalesce(
    (select c.alias from public.moderation_cases c
     where c.player = former_name.player order by c.opened_at desc, c.id desc limit 1),
    (select p.former_alias from public.profiles p where p.id = former_name.player)
  ), '');
$$;

-- Cases already hiding a name hold the name they're hiding.
update public.moderation_cases c set held_name = p.display_name
from public.profiles p
where p.id = c.player and c.status = 'open' and p.display_name is not null and public.case_hides(c.id);

revoke execute on function
  public.new_case_alias(uuid), public.set_case_alias(), public.set_former_alias(),
  public.case_hides(bigint, text), public.hidden_name(uuid), public.former_name(uuid)
  from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Telling the player
-------------------------------------------------------------------------------

-- As before, and the report that hides a name holds it on the case. The note
-- carries the tag others see.
create or replace function public.notify_name_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.case_hides(new.case_id) then
    update public.moderation_cases c set held_name = p.display_name
    from public.profiles p
    where c.id = new.case_id and p.id = c.player and c.held_name is null and p.display_name is not null;
  end if;
  if public.name_hidden(new.reported_id) then
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    values (new.reported_id, 'moderation', new.case_id || ':under_review',
      jsonb_build_object('action', 'under_review',
        'alias', (select c.alias from public.moderation_cases c where c.id = new.case_id)),
      false)
    on conflict do nothing;
    if found then
      perform public.invoke_activity_push();
    end if;
  end if;
  return null;
end;
$$;

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing', 'awards',
                    'odds', 'schedule', 'rank', 'poll', 'name_restored'));

-- As in pick polls, and a restored name is pushed whatever the player's
-- settings, like a moderator's decision.
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
      when 'name_restored' then true
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
-- Taking a name
-------------------------------------------------------------------------------

-- As before, and a retired name reads as not allowed, while a name held by
-- someone else's open case reads as taken.
create or replace function public.display_name_status(name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when name !~ '^[A-Za-z0-9_]{3,20}$' then 'invalid'
    when public.display_name_blocked(name)
      or exists (select 1 from public.retired_names r where r.name_key = lower(name)) then 'blocked'
    when exists (
      select 1 from public.profiles
      where lower(display_name) = lower(name) and id is distinct from (select auth.uid())
    ) or exists (
      select 1 from public.moderation_cases c
      where c.status = 'open' and lower(c.held_name) = lower(name) and c.player is distinct from (select auth.uid())
    ) then 'taken'
    else 'free'
  end;
$$;

-- As before, and the same two rules for every client, older builds included.
-- A held name is refused like a duplicate, so the app reads it as taken.
create or replace function public.guard_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is not null and new.display_name is distinct from old.display_name then
    if public.display_name_blocked(new.display_name)
       or exists (select 1 from public.retired_names r where r.name_key = lower(new.display_name)) then
      raise exception 'That name isn''t allowed.' using errcode = 'P0001', hint = 'blocked';
    end if;
    if exists (
      select 1 from public.moderation_cases c
      where c.status = 'open' and lower(c.held_name) = lower(new.display_name) and c.player <> new.id
    ) then
      raise exception 'That name is taken.' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

-- As before, with two exceptions to the weekly limit: a player's first
-- rename while their name is hidden, which also marks the case renamed, and
-- a moderator putting a held name back, which leaves them free to change it.
create or replace function public.track_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review bigint;
begin
  if new.display_name is not distinct from old.display_name then
    return new;
  end if;

  -- A deleted account's personal data goes immediately, its past names and
  -- any reports naming it included.
  if new.deleted_at is not null then
    delete from public.display_name_history where user_id = old.id;
    delete from public.name_reports where reported_id = old.id;
    return new;
  end if;

  -- Set by moderate() for the one update that restores a held name.
  if current_setting('fnf.name_restore', true) = old.id::text then
    if old.display_name is not null then
      insert into public.display_name_history (user_id, display_name) values (old.id, old.display_name);
    end if;
    new.name_changed_at := null;
    return new;
  end if;

  -- Players are held to the limit; a reset run by the owner is not. Taking a
  -- name for the first time, or again after a reset, is always allowed. This
  -- function runs as its owner, so the caller's role is read from the
  -- session rather than current_user.
  if current_setting('role', true) in ('anon', 'authenticated') and old.display_name is not null then
    perform public.require_good_standing(old.id);
    if new.display_name is not null then
      select c.id into review from public.moderation_cases c
      where c.player = old.id and c.status = 'open' and c.renamed_at is null
        and lower(c.held_name) = lower(old.display_name) and public.name_hidden(old.id)
      for update;
    end if;
    if review is not null then
      update public.moderation_cases set renamed_at = now() where id = review;
    elsif old.name_changed_at > now() - interval '7 days' then
      raise exception 'You can change your name once a week.'
        using errcode = 'P0001', hint = 'too_soon',
              detail = to_char(old.name_changed_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  if old.display_name is not null then
    insert into public.display_name_history (user_id, display_name) values (old.id, old.display_name);
  end if;
  if new.display_name is not null then
    new.name_changed_at := now();
  end if;
  return new;
end;
$$;

-- Where the app stands with your name: whether others see the tag instead,
-- the tag, and whether you've renamed since it was hidden.
create function public.my_name_review()
returns table (hidden boolean, alias smallint, renamed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.name_hidden((select auth.uid())), false),
         c.alias,
         coalesce(c.renamed_at is not null
           or (c.held_name is not null and lower(p.display_name) is distinct from lower(c.held_name)), false)
  from (select 1) one
  left join public.moderation_cases c on c.player = (select auth.uid()) and c.status = 'open'
  left join public.profiles p on p.id = c.player;
$$;

-- Renames you while your name is hidden. The first one in a case skips the
-- weekly limit; the name rules and the checks for taken names still apply.
create function public.rename_under_review(name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.name_hidden(me) then
    raise exception 'Your name isn''t under review.' using errcode = 'P0001', hint = 'not_hidden';
  end if;
  update public.profiles set display_name = rename_under_review.name where id = me and deleted_at is null;
end;
$$;

revoke execute on function public.my_name_review(), public.rename_under_review(text) from public, anon;
grant execute on function public.my_name_review(), public.rename_under_review(text) to authenticated;

-------------------------------------------------------------------------------
-- How players appear
-------------------------------------------------------------------------------

-- As before, with the case's tag for a hidden name and for a former member.
create or replace function public.league_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when uid is null then null
    when p.deleted_at is not null then public.former_name(uid)
    else case (select s.standing from public.player_standing(uid) s)
      when 'banned' then public.former_name(uid)
      else case
        when public.blocked_by_me(uid) then 'Blocked player'
        when (select s.standing from public.player_standing(uid) s) = 'suspended' then 'Suspended'
        else coalesce(
          case when uid is distinct from (select auth.uid()) then public.hidden_name(uid) end,
          p.display_name, 'Player')
      end
    end
  end
  from public.profiles p where p.id = uid;
$$;

-- As before, with the tag for a hidden name.
create or replace function public.season_leaderboard(max_rows integer default 100)
returns table (
  -- Null for a player scored this season with no card counted yet.
  rank          bigint,
  user_id       uuid,
  display_name  text,
  edge          bigint,
  points        bigint,
  correct       bigint,
  counted       bigint,
  cards         bigint,
  is_me         boolean,
  season_label  text
)
language sql
stable
security definer
set search_path = ''
as $$
  with season as (
    select id, number from public.seasons where starts_at is not null order by number desc limit 1
  ),
  season_bouts as (
    select b.id, b.event_id, b.version, b.card_segment
    from public.bouts b
    join public.events e on e.id = b.event_id
    where e.season_id is not distinct from (select id from season)
      and b.status = 'scheduled'
      and not public.changed_after_lock(b.id)
  ),
  main_card as (
    select sb.id, sb.event_id, sb.version from season_bouts sb
    where sb.card_segment = 'main' or sb.card_segment is null
  ),
  -- Players who can be ranked.
  eligible as (
    select p.id as user_id
    from public.profiles p
    where p.deleted_at is null and p.display_name is not null
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'banned'
      and exists (
        select 1 from public.scores s join public.bouts b on b.id = s.bout_id
        join public.events e on e.id = b.event_id
        where s.user_id = p.id and e.season_id is not distinct from (select id from season)
      )
  ),
  -- Cards each of them picked the whole main card of.
  committed as (
    select k.user_id, mc.event_id
    from main_card mc
    join public.picks k on k.bout_id = mc.id and k.bout_version = mc.version
    join eligible el on el.user_id = k.user_id
    group by k.user_id, mc.event_id
    having count(*) = (select count(*) from main_card x where x.event_id = mc.event_id)
  ),
  -- Their scored picks on those cards.
  field as (
    select s.user_id, s.bout_id, s.points, sb.event_id
    from public.scores s
    join season_bouts sb on sb.id = s.bout_id
    join committed c on c.user_id = s.user_id and c.event_id = sb.event_id
    where s.counts_for_accuracy
  ),
  fights as (
    select f.bout_id, avg(f.points) as average
    from field f
    group by f.bout_id
    having count(*) >= 3
  ),
  edges as (
    select f.user_id, round(sum(f.points - ft.average))::bigint as edge,
           -- Cards played, not ones picked ahead of time.
           count(distinct f.event_id) as cards
    from field f
    join fights ft on ft.bout_id = f.bout_id
    group by f.user_id
  ),
  -- Points and accuracy over every pick, as before.
  totals as (
    select s.user_id,
           sum(s.points) as points,
           count(*) filter (where s.correct) as correct,
           count(*) filter (where s.counts_for_accuracy) as counted
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where e.season_id is not distinct from (select id from season)
    group by s.user_id
  ),
  board as (
    select el.user_id, e.edge,
           coalesce(t.points, 0) as points, coalesce(t.correct, 0) as correct, coalesce(t.counted, 0) as counted,
           coalesce(e.cards, 0) as cards
    from eligible el
    left join edges e on e.user_id = el.user_id
    left join totals t on t.user_id = el.user_id
  ),
  standing as (
    select b.user_id, (select ps.standing from public.player_standing(b.user_id) ps) as standing
    from board b
  ),
  ranked as (
    select case when b.edge is not null then rank() over (
             partition by b.edge is null
             order by b.edge desc,
                      case when b.counted = 0 then 0 else b.correct::numeric / b.counted end desc
           ) end as rank,
           -- Ranked players first, then the rest by points.
           row_number() over (
             order by b.edge is null, b.edge desc,
                      case when b.counted = 0 then 0 else b.correct::numeric / b.counted end desc,
                      b.points desc
           ) as pos,
           b.user_id,
           case
             when public.blocked_by_me(b.user_id) then 'Blocked player'
             when st.standing = 'suspended' then 'Suspended'
             when b.user_id is distinct from (select auth.uid()) and public.name_hidden(b.user_id) then public.hidden_name(b.user_id)
             else p.display_name
           end as display_name,
           b.edge, b.points, b.correct, b.counted, b.cards,
           b.user_id = (select auth.uid()) as is_me
    from board b
    join public.profiles p on p.id = b.user_id
    join standing st on st.user_id = b.user_id
  )
  select r.rank, r.user_id, r.display_name, r.edge, r.points, r.correct, r.counted, r.cards, r.is_me,
         coalesce((select 'SEASON ' || number from season), 'PRE-SEASON')
  from ranked r
  where r.pos <= greatest(max_rows, 1) or r.is_me
  order by r.pos;
$$;

-- As before, with the tag for a hidden name.
create or replace function public.queue_league_join(league uuid, member uuid)
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
  if exists (select 1 from public.player_blocks b where b.blocker = l.owner_id and b.blocked = member) then
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
    jsonb_build_object(
      'league', l.name, 'leagueId', l.id,
      'member', coalesce(public.hidden_name(member), public.league_display_name(member))
    ),
    false
  );
  perform public.invoke_activity_push();
end;
$$;

-------------------------------------------------------------------------------
-- The inbox
-------------------------------------------------------------------------------

-- Every kind, for this build on, with the tag for a hidden name. Builds
-- before it show a kind they don't know as "You have a new notification", so
-- the RPCs they call leave restored names out.
create function public.inbox_items_v3(max_rows integer default 50)
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

create function public.inbox_unread_count_v3()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

-- The build before this one. inbox_items and my_notifications read through
-- it, so they leave restored names out too.
create or replace function public.inbox_items_v2(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items_v3(200) with ordinality i
  where i.kind <> 'name_restored'
  order by i.ordinality
  limit least(greatest(max_rows, 1), 200);
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
    and n.kind <> 'name_restored';
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
    and n.kind not in ('poll', 'name_restored');
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
    and n.kind not in ('matchup', 'standing', 'awards', 'odds', 'schedule', 'rank', 'poll', 'name_restored');
$$;

revoke execute on function public.inbox_items_v3(integer), public.inbox_unread_count_v3() from public, anon;
grant execute on function public.inbox_items_v3(integer), public.inbox_unread_count_v3() to authenticated;

-------------------------------------------------------------------------------
-- Deciding
-------------------------------------------------------------------------------

-- As before, and for a case that held a name:
--   dismiss                        a player who renamed gets the held name
--                                  back, free of the weekly limit, and the
--                                  new one is freed
--   warn, reset_name, suspend, ban the held name is retired. A player who
--                                  renamed keeps the new name: a warning or
--                                  reset says so instead of asking for one,
--                                  unless the new name is hidden too
create or replace function public.moderate(
  case_id  bigint,
  action   text,
  reason   text default null,
  note     text default null,
  duration interval default null
)
returns table (action_id bigint, player uuid, standing text, until timestamptz, strikes integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me      uuid := (select auth.uid());
  c       public.moderation_cases%rowtype;
  before  record;
  expires timestamptz;
  added   bigint;
  named   text;
  renamed boolean;
  kept    boolean;
begin
  -- Players reach this through the API as anon or authenticated; the SQL
  -- editor and the service role are trusted.
  if current_setting('role', true) in ('anon', 'authenticated')
     and not coalesce((select p.is_moderator from public.profiles p where p.id = me), false) then
    raise exception 'Only moderators can do that.' using errcode = '42501';
  end if;

  select * into c from public.moderation_cases mc where mc.id = moderate.case_id for update;
  if not found then
    raise exception 'There''s no case %.', moderate.case_id using errcode = 'P0001';
  end if;
  if action is null or action not in ('dismiss', 'warn', 'reset_name', 'suspend', 'ban', 'lift') then
    raise exception 'Unknown action %.', coalesce(action, 'null') using errcode = 'P0001';
  end if;
  if c.status = 'dismissed' or (c.status = 'actioned' and action = 'dismiss') then
    raise exception 'Case % is already closed.', c.id using errcode = 'P0001';
  end if;

  select * into before from public.player_standing(c.player);
  if action = 'lift' and before.standing = 'active' then
    raise exception 'The player isn''t suspended or banned.' using errcode = 'P0001';
  end if;
  if action = 'suspend' then
    if duration is null or duration <= interval '0' then
      raise exception 'A suspension needs a duration, like interval ''7 days''.' using errcode = 'P0001';
    end if;
    expires := now() + duration;
  end if;

  -- Read while the case is still open.
  select p.display_name into named from public.profiles p where p.id = c.player and p.deleted_at is null;
  renamed := c.status = 'open' and c.held_name is not null and named is not null
             and lower(named) <> lower(c.held_name);
  kept := renamed and action in ('warn', 'reset_name') and not public.name_hidden(c.player);

  insert into public.moderation_actions (case_id, player, action, reason, note, expires_at, moderator)
  values (c.id, c.player, action, nullif(left(btrim(reason), 200), ''), nullif(left(btrim(note), 500), ''), expires, me)
  returning id into added;

  if action = 'reset_name' and not kept then
    perform public.reset_display_name(c.player);
  elsif action = 'ban' then
    -- Sign-in and token refresh are refused from here on; the database
    -- refuses anything a still-valid token tries.
    update auth.users set banned_until = '2999-01-01' where id = c.player;
    perform public.hand_over_leagues(c.player);
  elsif action = 'lift' and before.standing = 'banned' then
    update auth.users set banned_until = null where id = c.player;
  end if;

  if action in ('warn', 'reset_name', 'suspend', 'ban') and c.status = 'open' and c.held_name is not null then
    insert into public.retired_names (name_key, case_id) values (lower(c.held_name), c.id)
    on conflict (name_key) do nothing;
  end if;

  -- The held name goes back unless something has since made it unusable: the
  -- blocked list caught it, or it was retired or taken in the meantime.
  if action = 'dismiss' and renamed
     and not public.display_name_blocked(c.held_name)
     and not exists (select 1 from public.retired_names r where r.name_key = lower(c.held_name))
     and not exists (
       select 1 from public.profiles p where lower(p.display_name) = lower(c.held_name) and p.id <> c.player
     ) then
    perform set_config('fnf.name_restore', c.player::text, true);
    update public.profiles p set display_name = c.held_name where p.id = c.player;
    perform set_config('fnf.name_restore', '', true);
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    values (c.player, 'name_restored', c.id || ':name_restored', jsonb_build_object('name', c.held_name), false)
    on conflict do nothing;
    perform public.invoke_activity_push();
  end if;

  if action in ('warn', 'reset_name', 'suspend', 'lift') then
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    values (c.player, 'moderation', c.id || ':' || added,
      jsonb_strip_nulls(jsonb_build_object('action', action, 'reason', nullif(left(btrim(reason), 200), ''),
        'until', expires, 'kept', case when kept then true end)),
      false);
    perform public.invoke_activity_push();
  end if;

  if action = 'dismiss' then
    update public.moderation_cases mc set status = 'dismissed', resolved_at = now(), resolved_by = me where mc.id = c.id;
  elsif action <> 'lift' and c.status = 'open' then
    update public.moderation_cases mc set status = 'actioned', resolved_at = now(), resolved_by = me where mc.id = c.id;
  end if;

  return query
  select added, c.player, s.standing, s.until, public.player_strikes(c.player)
  from public.player_standing(c.player) s;
end;
$$;

-- As before, with the case's tag, the name it holds and whether the player
-- has renamed since.
create or replace view public.open_cases with (security_invoker = true) as
select c.id as case_id,
       c.player,
       p.display_name as current_name,
       count(distinct r.reporter_id) as reporters,
       array_agg(distinct r.reason) filter (where r.reason is not null) as reasons,
       public.player_strikes(c.player) as strikes,
       (select s.standing from public.player_standing(c.player) s) as standing,
       c.opened_at,
       c.alias,
       c.held_name,
       c.held_name is not null and lower(p.display_name) is distinct from lower(c.held_name) as renamed
from public.moderation_cases c
join public.profiles p on p.id = c.player
left join public.name_reports r on r.case_id = c.id
where c.status = 'open'
group by c.id, c.player, p.display_name, c.opened_at, c.alias, c.held_name
order by count(distinct r.reporter_id) desc, c.opened_at;

revoke all on public.open_cases from anon, authenticated;
