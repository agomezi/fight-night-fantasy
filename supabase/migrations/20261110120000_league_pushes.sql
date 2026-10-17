-- Two league pushes during a card.
--
-- Lead changes: while a card is live, when the lead in your weekly
-- head-to-head flips, both of you hear it: "Ben overtook you" and "You
-- passed Ben, up by 7". The first lead of the night says nothing, a tie keeps
-- the last leader, and a matchup sends at most two flips a night, so a close
-- one can't spam. A matchup already decided by a missing required pick sends
-- none, and nobody hears about a player they've blocked.
--
-- Main card start: when the main card locks, everyone with a pick on the
-- card hears where they stand in each league they're ranked in: "You're 3rd
-- in Gym League going in."
--
-- Both follow the league activity toggle and show in the inbox. Each has its
-- own claim function, called on its own by sync-results, so neither can stop
-- result pushes or lock reminders if it fails.

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'matchup', 'standing'));

-------------------------------------------------------------------------------
-- A league's table, for the server
-------------------------------------------------------------------------------

-- league_standings without the membership check, so the main card push can
-- read ranks with nobody signed in. It goes by league_schedule, which is what
-- league_matchups returns, without the check.
create function public.league_table(league uuid)
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
  return query
  with schedule as materialized (
    select mu.user_a, mu.user_b, mu.winner, mu.state from public.league_schedule(league, season) mu
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
             and exists (select 1 from schedule sc where sc.state <> 'upcoming')
             -- Not ranked until one of your picks has scored this season, so
             -- sitting on 0 with nothing settled can't climb past players
             -- who have.
             and t.user_id is not null as ranked,
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

-- Only the functions here call it, as its owner.
revoke execute on function public.league_table(uuid) from public, anon, authenticated, service_role;

-- As before, for members only, from the shared table.
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
begin
  perform public.require_league_member(league);
  return query
  select t.rank, t.user_id, t.display_name, t.status, t.wins, t.losses, t.draws, t.points,
         t.correct, t.counted, t.is_me, t.is_owner, t.season_label
  from public.league_table(league) with ordinality t
  order by t.ordinality;
end;
$$;

-------------------------------------------------------------------------------
-- Lead changes
-------------------------------------------------------------------------------

-- Who last led each live matchup, and how many times the lead has changed
-- hands. A pair is stored lower id first, so it's the same row however the
-- schedule orders it.
create table public.matchup_leads (
  event_id  uuid not null references public.events (id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_a    uuid not null references public.profiles (id) on delete cascade,
  user_b    uuid not null references public.profiles (id) on delete cascade,
  leader    uuid not null,
  flips     integer not null default 0,
  primary key (event_id, league_id, user_a, user_b),
  check (user_a < user_b)
);

-- The card's scores when the leads were last checked, so the check only
-- runs again once a score has changed, not on every results sync.
create table public.matchup_lead_checks (
  event_id   uuid primary key references public.events (id) on delete cascade,
  scores_sig text not null
);

alter table public.matchup_leads enable row level security;
alter table public.matchup_lead_checks enable row level security;
revoke all on public.matchup_leads, public.matchup_lead_checks from public, anon, authenticated;

-- A matchup sends at most this many lead changes a night.
create function public.max_lead_pushes() returns integer language sql immutable set search_path = '' as $$ select 2 $$;

create function public.claim_matchup_notifications(event uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ev      public.events%rowtype;
  sig     text;
  changed boolean;
  lg      record;
  r       record;
  lead_by uuid;
  lo      uuid;
  hi      uuid;
  n       integer;
  side    record;
  body    jsonb;
begin
  select * into ev from public.events e where e.id = claim_matchup_notifications.event;
  if not found then
    return;
  end if;

  sig := (
    select count(*) || ':' || coalesce(max(s.computed_at)::text, '') || ':' || coalesce(sum(s.points), 0)
           || ':' || coalesce(sum(s.casual_points), 0)
    from public.scores s join public.bouts b on b.id = s.bout_id
    where b.event_id = ev.id
  );
  insert into public.matchup_lead_checks as c (event_id, scores_sig) values (ev.id, sig)
  on conflict (event_id) do update set scores_sig = excluded.scores_sig
    where c.scores_sig is distinct from excluded.scores_sig
  returning true into changed;
  if changed is null then
    return;
  end if;

  -- Every league with someone scored on this card.
  for lg in
    select distinct l.id, l.name, l.tier
    from public.leagues l
    join public.league_members m on m.league_id = l.id
    where exists (
      select 1 from public.scores s join public.bouts b on b.id = s.bout_id
      where s.user_id = m.user_id and b.event_id = ev.id
    )
  loop
    for r in
      select s.user_a, s.points_a, s.user_b, s.points_b
      from public.league_schedule(lg.id, public.current_season()) s
      -- Live, or final the same night, so the fight that decides it still
      -- counts when the card goes final in the same update.
      where s.event_id = ev.id and s.user_b is not null
        and (s.state = 'live' or (s.state = 'final' and ev.locks_at > now() - interval '12 hours'))
    loop
      -- Missing the tier's required picks loses whatever the points say, so
      -- a lead there means nothing.
      continue when not public.met_tier_picks(lg.tier, r.user_a, ev.id)
                 or not public.met_tier_picks(lg.tier, r.user_b, ev.id);
      lead_by := case when r.points_a > r.points_b then r.user_a
                      when r.points_b > r.points_a then r.user_b end;
      -- Level: the last leader stands.
      continue when lead_by is null;
      lo := least(r.user_a, r.user_b);
      hi := greatest(r.user_a, r.user_b);

      -- The first lead of the night is only noted.
      insert into public.matchup_leads as ml (event_id, league_id, user_a, user_b, leader)
      values (ev.id, lg.id, lo, hi, lead_by)
      on conflict do nothing;
      continue when found;

      n := null;
      update public.matchup_leads ml set leader = lead_by, flips = ml.flips + 1
      where ml.event_id = ev.id and ml.league_id = lg.id and ml.user_a = lo and ml.user_b = hi
        and ml.leader is distinct from lead_by
      returning ml.flips into n;
      continue when n is null or n > public.max_lead_pushes();

      for side in
        select x.me, x.opp, x.mine, x.theirs
        from (values (r.user_a, r.user_b, r.points_a, r.points_b),
                     (r.user_b, r.user_a, r.points_b, r.points_a)) x(me, opp, mine, theirs)
        join public.profiles p on p.id = x.me
        join public.profiles o on o.id = x.opp
        where p.deleted_at is null
          -- Still in the league: leaving keeps you in this season's rotation.
          and exists (
            select 1 from public.league_members m
            where m.league_id = lg.id and m.user_id = x.me and m.left_at is null
          )
          -- Nothing about a player you've blocked or who blocked you, or one
          -- who is gone, banned or suspended.
          and not exists (
            select 1 from public.player_blocks pb
            where (pb.blocker = x.me and pb.blocked = x.opp) or (pb.blocker = x.opp and pb.blocked = x.me)
          )
          and o.deleted_at is null
          and (select ps.standing from public.player_standing(x.opp) ps) is distinct from 'banned'
          and (select ps.standing from public.player_standing(x.opp) ps) is distinct from 'suspended'
      loop
        body := jsonb_build_object(
          'event', ev.name,
          'league', lg.name,
          'leagueId', lg.id,
          'opponent', public.league_display_name(side.opp),
          -- Which matchup, for a doubleheader week.
          'opponentId', side.opp,
          'mine', side.mine,
          'theirs', side.theirs,
          'lead', side.me = lead_by
        );
        insert into public.notifications_sent (user_id, kind, key, payload)
        values (side.me, 'matchup', ev.id || ':' || lg.id || ':' || side.opp || ':' || n, body)
        on conflict do nothing;
        continue when not found;

        user_id := side.me;
        kind := 'matchup';
        payload := body;
        tokens := array(select t.token from public.push_tokens t where t.user_id = side.me);
        wanted := (select p.notify_league_activity from public.profiles p where p.id = side.me);
        return next;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.claim_matchup_notifications(uuid) from public, anon, authenticated;
grant execute on function public.claim_matchup_notifications(uuid) to service_role;
revoke execute on function public.max_lead_pushes() from public, anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- Main card start
-------------------------------------------------------------------------------

-- Ranks for everyone with a pick on a card whose main card locked in the
-- last 15 minutes. The reminders job runs every 5, so this catches each card
-- once; the key makes sure of it.
create function public.claim_standing_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with main_start as (
    select e.id, e.name
    from public.events e
    join public.bouts b on b.event_id = e.id
    where e.status in ('scheduled', 'live') and b.card_segment = 'main' and b.status = 'scheduled'
    group by e.id
    having min(b.locks_at) <= now() and min(b.locks_at) > now() - interval '15 minutes'
  ),
  players as (
    select distinct ms.id as event_id, ms.name as event_name, k.user_id
    from main_start ms
    join public.bouts b on b.event_id = ms.id and b.status = 'scheduled'
    join public.picks k on k.bout_id = b.id and k.bout_version = b.version
    join public.profiles p on p.id = k.user_id
    where p.deleted_at is null
      and not exists (
        select 1 from public.notifications_sent n
        where n.user_id = k.user_id and n.kind = 'standing' and n.key = ms.id::text
      )
  ),
  leagues as (
    select distinct m.league_id
    from public.league_members m
    where m.user_id in (select pl.user_id from players pl) and m.left_at is null
  ),
  -- Each league's table once, however many of its players are told.
  tables as materialized (
    select lg.league_id, t.user_id, t.rank,
           count(*) over (partition by lg.league_id, t.rank) > 1 as tied
    from leagues lg
    cross join lateral public.league_table(lg.league_id) t
  ),
  candidates as (
    select pl.user_id, pl.event_id::text as key,
      jsonb_build_object(
        'event', pl.event_name,
        'leagues', jsonb_agg(
          jsonb_build_object('league', l.name, 'leagueId', l.id, 'rank', t.rank, 'tied', t.tied)
          order by t.rank, l.name)
      ) as payload
    from players pl
    join tables t on t.user_id = pl.user_id and t.rank is not null
    join public.leagues l on l.id = t.league_id
    -- Only leagues you're still in.
    join public.league_members m on m.league_id = t.league_id and m.user_id = pl.user_id and m.left_at is null
    group by pl.user_id, pl.event_id, pl.event_name
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'standing', c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  select c.user_id, 'standing'::text, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_league_activity
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.key
  join public.profiles p on p.id = c.user_id;
$$;

revoke execute on function public.claim_standing_notifications() from public, anon, authenticated;
grant execute on function public.claim_standing_notifications() to service_role;

-- The reminders job also wakes while a main card has just locked.
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
      and b.locks_at > now() - interval '15 minutes' and b.locks_at <= now() + interval '30 minutes'
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

-------------------------------------------------------------------------------
-- The inbox
-------------------------------------------------------------------------------

-- The inbox, every kind. A lead change names the opponent as you'd see them
-- now: "Blocked player" once you've blocked them, "Player" while their name
-- is hidden. The opponent is the key's third part.
create function public.inbox_items(max_rows integer default 50)
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

create function public.inbox_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null and n.read_at is null;
$$;

revoke execute on function public.inbox_items(integer), public.inbox_unread_count() from public, anon;
grant execute on function public.inbox_items(integer), public.inbox_unread_count() to authenticated;

-- What builds from before these kinds call. They'd show a lead change or a
-- standing as a card's final score, so those stay out of their inbox and
-- badge; this build calls the two above.
create or replace function public.my_notifications(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.kind, i.key, i.payload, i.sent_at, i.read
  from public.inbox_items(200) with ordinality i
  where i.kind not in ('matchup', 'standing')
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
    and n.kind not in ('matchup', 'standing');
$$;
