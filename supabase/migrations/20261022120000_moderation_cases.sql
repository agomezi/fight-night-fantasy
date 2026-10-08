-- Moderation: cases, an action log, and enforcing what's decided.
--
-- Every report belongs to a case, one open case per reported player at a
-- time. A moderator decides with moderate(case, action, ...):
--
--   dismiss     no violation; closes the case
--   warn        asks the player to change their name
--   reset_name  clears their name; they pick a new one in onboarding
--   suspend     for a set time: they can look around but can't pick, join or
--               create a league, report, or change their name
--   ban         permanent: sign-in is refused, they leave every table and
--               show as Former Member
--   lift        ends a suspension or ban early
--
-- Every decision is a row in moderation_actions, never edited, and a player's
-- standing is read from the latest suspend, ban or lift. The player hears
-- about everything but a ban in their inbox and by push.
--
-- Until the review screen exists, moderators run moderate() from the SQL
-- editor; the report emails carry the lines to paste.

-------------------------------------------------------------------------------
-- Cases
-------------------------------------------------------------------------------

create table public.moderation_cases (
  id          bigint generated always as identity primary key,
  player      uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create unique index moderation_cases_one_open on public.moderation_cases (player) where status = 'open';
create index moderation_cases_player_idx on public.moderation_cases (player, opened_at);

alter table public.moderation_cases enable row level security;
revoke all on public.moderation_cases from anon, authenticated;

alter table public.name_reports add column case_id bigint references public.moderation_cases (id) on delete cascade;

-- Reports already filed: one open case per reported player.
insert into public.moderation_cases (player, opened_at)
select r.reported_id, min(r.created_at) from public.name_reports r group by r.reported_id;
update public.name_reports r set case_id = c.id from public.moderation_cases c where c.player = r.reported_id;

alter table public.name_reports alter column case_id set not null;
create index name_reports_case_idx on public.name_reports (case_id);

-- A report joins the player's open case, or opens one.
create function public.file_report_in_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.moderation_cases (player) values (new.reported_id)
  on conflict (player) where status = 'open' do nothing;
  select c.id into new.case_id from public.moderation_cases c
  where c.player = new.reported_id and c.status = 'open';
  return new;
end;
$$;

revoke execute on function public.file_report_in_case() from public, anon, authenticated;

create trigger name_reports_case before insert on public.name_reports
  for each row execute function public.file_report_in_case();

-------------------------------------------------------------------------------
-- The action log
-------------------------------------------------------------------------------

create table public.moderation_actions (
  id         bigint generated always as identity primary key,
  case_id    bigint not null references public.moderation_cases (id) on delete cascade,
  player     uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (action in ('dismiss', 'warn', 'reset_name', 'suspend', 'ban', 'lift')),
  -- Shown to the player.
  reason     text check (char_length(reason) <= 200),
  -- For moderators only.
  note       text check (char_length(note) <= 500),
  expires_at timestamptz,
  -- Null when run from the SQL editor.
  moderator  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((action = 'suspend') = (expires_at is not null))
);

create index moderation_actions_player_idx on public.moderation_actions (player, created_at);
create index moderation_actions_case_idx on public.moderation_actions (case_id);

alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;

-- Never edited. Rows go only when the player's account does.
create function public.moderation_actions_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Moderation actions can''t be changed. Record a new one instead.';
end;
$$;

create trigger moderation_actions_frozen before update on public.moderation_actions
  for each row execute function public.moderation_actions_frozen();

-------------------------------------------------------------------------------
-- Standing
-------------------------------------------------------------------------------

-- 'active', 'suspended' (with when it ends) or 'banned', from the latest
-- suspend, ban or lift. A suspension ends on its own.
create function public.player_standing(player uuid)
returns table (standing text, until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with last as (
    select a.action, a.expires_at from public.moderation_actions a
    where a.player = player_standing.player and a.action in ('suspend', 'ban', 'lift')
    order by a.created_at desc, a.id desc
    limit 1
  )
  select case
           when l.action = 'ban' then 'banned'
           when l.action = 'suspend' and l.expires_at > now() then 'suspended'
           else 'active'
         end,
         case when l.action = 'suspend' and l.expires_at > now() then l.expires_at end
  from (select 1) one
  left join last l on true;
$$;

revoke execute on function public.player_standing(uuid) from public, anon, authenticated;

-- Your own standing, so the app can explain a refusal before it happens.
create function public.my_standing()
returns table (standing text, until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.player_standing((select auth.uid()));
$$;

revoke execute on function public.my_standing() from public, anon;
grant execute on function public.my_standing() to authenticated;

-- Refuses a suspended or banned player, in words written for them.
create function public.require_good_standing(player uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
begin
  select * into s from public.player_standing(player);
  if s.standing = 'suspended' then
    raise exception 'Your account is suspended until %.', to_char(s.until at time zone 'UTC', 'Mon FMDD')
      using errcode = 'P0001', hint = 'suspended',
            detail = to_char(s.until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  elsif s.standing = 'banned' then
    raise exception 'Your account has been banned.' using errcode = 'P0001', hint = 'banned';
  end if;
end;
$$;

revoke execute on function public.require_good_standing(uuid) from public, anon, authenticated;

-- How many cases have ended in action against the player: the count the
-- escalation policy works from.
create function public.player_strikes(player uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct a.case_id)::integer from public.moderation_actions a
  where a.player = player_strikes.player and a.action in ('warn', 'reset_name', 'suspend', 'ban');
$$;

revoke execute on function public.player_strikes(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Enforcement
-------------------------------------------------------------------------------

-- Picks. A trigger function runs without an EXECUTE check, so this can stay
-- private and still read the action log.
create function public.picks_require_standing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_good_standing(new.user_id);
  return new;
end;
$$;

revoke execute on function public.picks_require_standing() from public, anon, authenticated;

create trigger picks_standing before insert or update on public.picks
  for each row execute function public.picks_require_standing();

-- Creating and joining leagues: as before, and in good standing.
create or replace function public.require_named_player()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform public.require_good_standing(uid);
  if not exists (
    select 1 from public.profiles
    where id = uid and deleted_at is null and display_name is not null
  ) then
    raise exception 'Pick a display name first.' using errcode = 'P0001', hint = 'needs_name';
  end if;
  return uid;
end;
$$;

-- Reporting: as before, and in good standing.
create or replace function public.check_report_limit(reporter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_good_standing(reporter);
  perform pg_advisory_xact_lock(hashtextextended('name_reports:' || reporter, 0));
  if (select count(*) from public.name_reports r
      where r.reporter_id = reporter and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow.'
      using errcode = 'P0001', hint = 'report_limit';
  end if;
end;
$$;

-- Renaming: as before, and in good standing. Taking a name when you have none,
-- as after a reset, is still allowed, so a suspended player isn't stuck in
-- onboarding.
create or replace function public.track_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Players are held to the limit; a reset run by the owner is not. Taking a
  -- name for the first time, or again after a reset, is always allowed. This
  -- function runs as its owner, so the caller's role is read from the
  -- session rather than current_user.
  if current_setting('role', true) in ('anon', 'authenticated') and old.display_name is not null then
    perform public.require_good_standing(old.id);
    if old.name_changed_at > now() - interval '7 days' then
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

-------------------------------------------------------------------------------
-- How players appear
-------------------------------------------------------------------------------

-- As before: a banned player shows as Former Member, a suspended one as
-- Suspended.
create or replace function public.league_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when uid is null then null
    when p.deleted_at is not null then 'Former Member'
    else case (select s.standing from public.player_standing(uid) s)
      when 'banned' then 'Former Member'
      when 'suspended' then 'Suspended'
      else coalesce(p.display_name, 'Player')
    end
  end
  from public.profiles p where p.id = uid;
$$;

-- As before, without banned players, and with suspended ones as Suspended.
create or replace function public.season_leaderboard(max_rows integer default 100)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
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
  totals as (
    select s.user_id,
           sum(s.points) as points,
           count(*) filter (where s.correct) as correct,
           count(*) filter (where s.counts_for_accuracy) as counted,
           count(distinct b.event_id) as cards
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where e.season_id is not distinct from (select id from season)
    group by s.user_id
  ),
  standing as (
    select t.user_id, (select ps.standing from public.player_standing(t.user_id) ps) as standing
    from totals t
  ),
  ranked as (
    select rank() over (
             order by t.points desc,
                      case when t.counted = 0 then 0 else t.correct::numeric / t.counted end desc
           ) as rank,
           t.user_id,
           case when st.standing = 'suspended' then 'Suspended' else p.display_name end as display_name,
           t.points, t.correct, t.counted, t.cards,
           t.user_id = (select auth.uid()) as is_me
    from totals t
    join public.profiles p on p.id = t.user_id
    join standing st on st.user_id = t.user_id
    where p.deleted_at is null and p.display_name is not null and st.standing <> 'banned'
  )
  select r.rank, r.user_id, r.display_name, r.points, r.correct, r.counted, r.cards, r.is_me,
         coalesce((select 'SEASON ' || number from season), 'PRE-SEASON')
  from ranked r
  where r.rank <= greatest(max_rows, 1) or r.is_me
  order by r.rank, r.display_name;
$$;

-- As before, with banned players listed as former members, like deleted ones.
create or replace function public.league_standings(league uuid)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  status        text,
  wins          integer,
  losses        integer,
  draws         integer,
  points        integer,
  correct       integer,
  counted       integer,
  is_me         boolean,
  is_owner      boolean,
  season_label  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season uuid := public.current_season();
begin
  perform public.require_league_member(league);

  return query
  with schedule as materialized (
    select mu.user_a, mu.user_b, mu.winner, mu.state from public.league_matchups(league) mu
  ),
  finals as (
    select sc.user_a, sc.user_b, sc.winner from schedule sc
    where sc.state = 'final' and sc.user_b is not null
  ),
  outcomes as (
    select f.user_a as uid, f.user_b as opp, f.winner from finals f
    union all
    select f.user_b, f.user_a, f.winner from finals f
  ),
  tally as (
    select o.uid,
           count(*) filter (where o.winner = o.uid)::integer as w,
           count(*) filter (where o.winner = o.opp)::integer as l,
           count(*) filter (where o.winner is null)::integer as d
    from outcomes o group by o.uid
  ),
  totals as (
    select * from public.league_season_totals(league, season)
  ),
  listed as (
    select m.user_id as uid,
           case
             when m.left_at is not null then 'left'
             when p.deleted_at is not null
               or (select ps.standing from public.player_standing(p.id) ps) = 'banned' then 'former'
             when season is null then 'active'
             else m.status::text
           end as st,
           case when season is null then m.left_at is null else m.status = 'active' end
             and exists (select 1 from schedule sc where sc.state <> 'upcoming') as ranked,
           coalesce(rc.w, 0) as w, coalesce(rc.l, 0) as l, coalesce(rc.d, 0) as d,
           coalesce(t.points, 0) as pts,
           coalesce(t.correct, 0) as hit,
           coalesce(t.counted, 0) as cnt
    from public.league_members m
    join public.profiles p on p.id = m.user_id
    left join tally rc on rc.uid = m.user_id
    left join totals t on t.user_id = m.user_id
    where m.league_id = league
      -- Someone who left during the pre-season is not coming back for the
      -- rest of it; their old matchups still count for their opponents.
      and not (season is null and m.left_at is not null)
  ),
  keyed as (
    select r.*,
           case when r.w + r.l + r.d = 0 then 0
                else (3 * r.w + r.d)::numeric / (r.w + r.l + r.d) end as pct,
           case when r.cnt = 0 then 0 else r.hit::numeric / r.cnt end as acc
    from listed r
  ),
  grouped as (
    select k.*, count(*) over (partition by k.ranked, k.pct, k.pts, k.acc) as level
    from keyed k
  ),
  h2h as (
    select g.*,
           case when g.ranked and g.level = 2 then (
             select coalesce(sum(case when rs.winner = g.uid then 1 when rs.winner = rs.opp then -1 else 0 end), 0)
             from outcomes rs
             join grouped o on o.uid = rs.opp
             where rs.uid = g.uid and o.ranked and o.level = 2
               and o.pct = g.pct and o.pts = g.pts and o.acc = g.acc
           ) else 0 end as h2h
    from grouped g
  )
  select case when h.ranked then rank() over (
           partition by h.ranked order by h.pct desc, h.pts desc, h.acc desc, h.h2h desc
         ) end,
         h.uid, public.league_display_name(h.uid), h.st,
         h.w, h.l, h.d, h.pts, h.hit, h.cnt,
         h.uid = (select auth.uid()),
         h.uid = (select l.owner_id from public.leagues l where l.id = league),
         coalesce((select 'SEASON ' || s.number from public.seasons s where s.id = season), 'PRE-SEASON')
  from h2h h
  order by h.ranked desc, h.pct desc, h.pts desc, h.acc desc, h.h2h desc, h.st, public.league_display_name(h.uid);
end;
$$;

-------------------------------------------------------------------------------
-- Telling the player
-------------------------------------------------------------------------------

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation'));

-- As before. A moderation notice is pushed whatever the player's settings,
-- since it tells them what they can and can't do.
create or replace function public.claim_activity_notifications()
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
    (c.kind = 'moderation' or p.notify_league_activity) and c.sent_at > now() - interval '1 day'
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;

-------------------------------------------------------------------------------
-- Deciding
-------------------------------------------------------------------------------

-- Records a decision on a case, carries it out, tells the player and closes
-- the case. `reason` is shown to the player; `note` is for moderators.
-- Callable by moderators, and from the SQL editor or the service role.
-- Returns the player's standing and strikes afterwards.
create function public.moderate(
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

  insert into public.moderation_actions (case_id, player, action, reason, note, expires_at, moderator)
  values (c.id, c.player, action, nullif(left(btrim(reason), 200), ''), nullif(left(btrim(note), 500), ''), expires, me)
  returning id into added;

  if action = 'reset_name' then
    perform public.reset_display_name(c.player);
  elsif action = 'ban' then
    -- Sign-in and token refresh are refused from here on; the database
    -- refuses anything a still-valid token tries.
    update auth.users set banned_until = '2999-01-01' where id = c.player;
    perform public.hand_over_leagues(c.player);
  elsif action = 'lift' and before.standing = 'banned' then
    update auth.users set banned_until = null where id = c.player;
  end if;

  if action in ('warn', 'reset_name', 'suspend', 'lift') then
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    values (c.player, 'moderation', c.id || ':' || added,
      jsonb_strip_nulls(jsonb_build_object('action', action, 'reason', nullif(left(btrim(reason), 200), ''), 'until', expires)),
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

revoke execute on function public.moderate(bigint, text, text, text, interval) from public, anon;
grant execute on function public.moderate(bigint, text, text, text, interval) to authenticated, service_role;

-- Open cases for the SQL editor, most reporters first.
create view public.open_cases with (security_invoker = true) as
select c.id as case_id,
       c.player,
       p.display_name as current_name,
       count(distinct r.reporter_id) as reporters,
       array_agg(distinct r.reason) filter (where r.reason is not null) as reasons,
       public.player_strikes(c.player) as strikes,
       (select s.standing from public.player_standing(c.player) s) as standing,
       c.opened_at
from public.moderation_cases c
join public.profiles p on p.id = c.player
left join public.name_reports r on r.case_id = c.id
where c.status = 'open'
group by c.id, c.player, p.display_name, c.opened_at
order by count(distinct r.reporter_id) desc, c.opened_at;

revoke all on public.open_cases from anon, authenticated;

-------------------------------------------------------------------------------
-- Report emails, now with the case
-------------------------------------------------------------------------------

-- As before, with the open case, the player's strikes and standing, so the
-- email can carry the moderate() lines to paste.
drop function public.claim_report_emails();

create function public.claim_report_emails()
returns table (
  reported_id  uuid,
  case_id      bigint,
  current_name text,
  past_names   text[],
  protected    boolean,
  reporters    integer,
  established  integer,
  leagues      integer,
  burst        boolean,
  strikes      integer,
  standing     text,
  reports      jsonb
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.name_reports r set emailed_at = now()
    where r.emailed_at is null and not public.report_email_held(r.reported_id)
    returning r.id, r.case_id, r.reported_id, r.display_name, r.reason, r.note, r.league_id, r.reporter_id, r.created_at
  ),
  targets as (
    select c.reported_id, max(c.case_id) as case_id from claimed c group by c.reported_id
  ),
  everyone as (
    select r.reported_id, r.reporter_id, r.league_id, r.created_at,
      public.reporter_established(r.reporter_id) as established
    from public.name_reports r
    where r.reported_id in (select t.reported_id from targets t)
  ),
  tally as (
    select e.reported_id,
      count(distinct e.reporter_id)::integer as reporters,
      (count(distinct e.reporter_id) filter (where e.established))::integer as established,
      count(distinct e.league_id)::integer as leagues,
      count(*) filter (where e.created_at > now() - interval '1 hour') as last_hour
    from everyone e
    group by e.reported_id
  )
  select t.reported_id, t.case_id, p.display_name,
    array(
      select h.display_name from public.display_name_history h
      where h.user_id = t.reported_id
      order by h.changed_at desc
    ),
    p.is_moderator,
    s.reporters, s.established, s.leagues,
    s.last_hour >= 3 or (s.reporters >= 2 and 2 * (s.reporters - s.established) > s.reporters),
    public.player_strikes(t.reported_id),
    (select ps.standing from public.player_standing(t.reported_id) ps),
    (
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'reportedName', c.display_name,
          'reason', c.reason,
          'note', c.note,
          'league', l.name,
          'reporterId', c.reporter_id,
          'reporterName', rp.display_name,
          'reporterAgeDays', floor(extract(epoch from now() - rp.created_at) / 86400)::integer,
          'reporterReports', (select count(*) from public.name_reports x where x.reporter_id = c.reporter_id),
          'reporterEstablished', public.reporter_established(c.reporter_id),
          'reportedAt', c.created_at
        ) order by c.created_at, c.id)
      from claimed c
      join public.profiles rp on rp.id = c.reporter_id
      left join public.leagues l on l.id = c.league_id
      where c.reported_id = t.reported_id
    )
  from targets t
  join public.profiles p on p.id = t.reported_id
  join tally s on s.reported_id = t.reported_id
  order by t.reported_id;
$$;

revoke execute on function public.claim_report_emails() from public, anon, authenticated;
grant execute on function public.claim_report_emails() to service_role;
