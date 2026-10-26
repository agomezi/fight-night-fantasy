-- Pick minimum warnings: nobody misses a league's minimum without being told.
--
-- Lock reminders reach the inbox without a push token too, for anyone in a
-- league. Two new reminders for players short of a league's minimum: one the
-- day before the card, and one an hour before each later section that has a
-- required fight they haven't picked. Both keep the 'reminder' kind, so older
-- builds list them with the reminder they already know.
--
-- A league's owner sees how many of the required fights each member has
-- picked, never which fighters, so they can chase people themselves.

-------------------------------------------------------------------------------
-- Who is short, per league
-------------------------------------------------------------------------------

-- For each league a player is in: how many fights it requires on a card, how
-- many they've picked, how many locked unpicked (the week is already a
-- forfeit), how many still open are unpicked, and how many of those are in
-- the section locking at `section_lock` (null: none asked for).
create function public.pick_shortfall(player uuid, event uuid, section_lock timestamptz default null)
returns table (league_id uuid, league_name text, required integer, picked integer, missed integer, open_missing integer, section_missing integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name,
         count(*)::integer,
         count(*) filter (where k.picked)::integer,
         count(*) filter (where not k.picked and k.lock <= now())::integer,
         count(*) filter (where not k.picked and k.lock > now())::integer,
         count(*) filter (where not k.picked and k.lock = section_lock)::integer
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  cross join lateral public.league_required_bouts(l.id, event) rb(id)
  join public.bouts b on b.id = rb.id
  join public.events e on e.id = b.event_id
  cross join lateral (
    select coalesce(b.locks_at, e.locks_at) as lock,
           exists (
             select 1 from public.picks p
             where p.user_id = player and p.bout_id = b.id and p.bout_version = b.version
           ) as picked
  ) k
  where m.user_id = player and m.left_at is null
  group by l.id, l.name;
$$;

revoke execute on function public.pick_shortfall(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- Lock reminders
-------------------------------------------------------------------------------

-- As before (20261111), plus:
--  * no push token needed: the inbox row is written either way, for anyone
--    with a token or in a league (an empty token list sends no push);
--  * a day-before reminder for players short of a league's minimum, more than
--    90 minutes before the card's first lock (the hour-out one covers closer);
--  * an hour before each section that locks after the first, for players
--    with a required fight in it still to pick.
-- Banned players get none.
create or replace function public.claim_reminders()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with recipients as (
    select p.id from public.profiles p
    where p.deleted_at is null
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'banned'
      and (
        exists (select 1 from public.push_tokens t where t.user_id = p.id)
        or exists (select 1 from public.league_members m where m.user_id = p.id and m.left_at is null)
      )
  ),
  main_locks as (
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
  due_main as (
    select d.*, public.pro_main_event(d.id) as main_bout from due d
  ),
  lock_candidates as (
    select p.id as user_id, d.key,
      jsonb_build_object(
        'event', d.name,
        'minutes', greatest(1, round(extract(epoch from d.locks_at - now()) / 60)),
        'hasMainPick', exists (
          select 1 from public.picks k
          join public.bouts b on b.id = k.bout_id
          where k.user_id = p.id and b.id = d.main_bout and k.bout_version = b.version
        )
      ) || jsonb_build_object(
        -- Fights still open that any of your leagues requires and you haven't
        -- picked, so the reminder doesn't say you're set when you aren't.
        'leagueMissing', (
          select count(distinct b.id) from public.league_members m
          cross join lateral public.league_required_bouts(m.league_id, d.id) rb(id)
          join public.bouts b on b.id = rb.id
          join public.events e on e.id = b.event_id
          where m.user_id = p.id and m.left_at is null
            and coalesce(b.locks_at, e.locks_at) > now()
            and not exists (
              select 1 from public.picks k
              where k.user_id = p.id and k.bout_id = b.id and k.bout_version = b.version
            )
        )
      ) || case when d.section = 'main' then jsonb_build_object(
        'section', 'main',
        'missing', (
          select count(*) from public.bouts b
          where b.event_id = d.id and b.card_segment = 'main' and b.status = 'scheduled'
            and not exists (
              select 1 from public.picks k
              where k.user_id = p.id and k.bout_id = b.id and k.bout_version = b.version
            )
        )
      ) else '{}'::jsonb end as payload
    from due_main d
    cross join recipients p
  ),
  -- The day before: once, while the first lock is 90 minutes to a day away.
  eve_due as (
    select e.id, e.name, e.locks_at from public.events e
    where e.status = 'scheduled'
      and e.locks_at > now() + interval '90 minutes' and e.locks_at <= now() + interval '24 hours'
  ),
  eve_short as (
    select d.id, d.name, d.locks_at, p.id as user_id, s.*,
           row_number() over (partition by d.id, p.id order by s.open_missing desc, s.league_name) as worst
    from eve_due d
    cross join recipients p
    cross join lateral public.pick_shortfall(p.id, d.id) s
    where s.open_missing > 0
  ),
  eve_candidates as (
    select s.user_id, s.id || ':eve' as key,
      jsonb_build_object(
        'event', s.name,
        'section', 'eve',
        -- For older builds, which read any reminder as "locks in N min" and,
        -- without hasMainPick, nudge to pick rather than say you're set.
        'minutes', greatest(1, round(extract(epoch from s.locks_at - now()) / 60)),
        'hasMainPick', false,
        'league', s.league_name,
        'required', s.required,
        'picked', s.picked,
        'leagueMissing', s.open_missing,
        'firstAt', s.locks_at
      ) as payload
    from eve_short s
    where s.worst = 1
  ),
  -- Each section's lock, for the sections after the card's first.
  sections as (
    -- A bout entered by hand has no segment and counts as main card.
    select e.id, e.name, coalesce(b.card_segment::text, 'main') as card_segment, min(b.locks_at) as lock
    from public.events e
    join public.bouts b on b.event_id = e.id
    where e.status in ('scheduled', 'live') and b.status = 'scheduled' and b.locks_at is not null
    group by e.id, e.name, e.locks_at, coalesce(b.card_segment::text, 'main')
    having min(b.locks_at) > e.locks_at
  ),
  section_short as (
    select x.id, x.name, x.card_segment, x.lock, p.id as user_id, s.*,
           row_number() over (partition by x.id, x.card_segment, p.id order by s.section_missing desc, s.league_name) as worst
    from sections x
    cross join recipients p
    cross join lateral public.pick_shortfall(p.id, x.id, x.lock) s
    -- A league whose minimum is already missed has nothing left to warn about.
    where x.lock > now() and x.lock <= now() + interval '60 minutes' and s.section_missing > 0 and s.missed = 0
  ),
  section_candidates as (
    -- Its own key: '<event>:main' is the 30-minute main card reminder's.
    select s.user_id, s.id || ':section:' || s.card_segment as key,
      jsonb_build_object(
        'event', s.name,
        'section', 'segment',
        'segment', s.card_segment,
        'minutes', greatest(1, round(extract(epoch from s.lock - now()) / 60)),
        'hasMainPick', false,
        'league', s.league_name,
        'segmentMissing', s.section_missing,
        'leagueMissing', s.open_missing
      ) as payload
    from section_short s
    where s.worst = 1
  ),
  candidates as (
    select * from lock_candidates
    union all
    select * from eve_candidates
    union all
    select * from section_candidates
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, 'reminder', c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.key
  )
  -- The day-before push carries the player's zone so its lock time reads
  -- right; the inbox uses the phone's.
  select c.user_id, 'reminder'::text,
    case when c.payload->>'section' = 'eve'
         then c.payload || jsonb_build_object('tz', coalesce(p.time_zone, 'America/New_York'))
         else c.payload end,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    p.notify_reminders
  from candidates c
  join claimed k on k.user_id = c.user_id and k.key = c.key
  join public.profiles p on p.id = c.user_id;
$$;

-------------------------------------------------------------------------------
-- The owner sees who's short
-------------------------------------------------------------------------------

-- Each active member's count of the league's required fights on a card, and
-- how many of them they've picked. Counts only, never which fighters, so
-- nothing about a pick shows before it locks. Owner only.
create function public.league_pick_status(league uuid, event uuid)
returns table (user_id uuid, display_name text, required integer, picked integer, missed integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.leagues l where l.id = league and l.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the league''s owner can see this.' using errcode = 'P0001', hint = 'not_owner';
  end if;

  return query
  with req as (
    select b.id, b.version, coalesce(b.locks_at, e.locks_at) as lock
    from public.league_required_bouts(league, event) rb(id)
    join public.bouts b on b.id = rb.id
    join public.events e on e.id = b.event_id
  ),
  members as (
    select m.user_id from public.league_members m
    join public.profiles p on p.id = m.user_id
    where m.league_id = league and m.left_at is null and p.deleted_at is null
  )
  select mb.user_id, public.league_display_name(mb.user_id),
         (select count(*) from req)::integer,
         count(r.id) filter (where k.user_id is not null)::integer,
         count(r.id) filter (where k.user_id is null and r.lock <= now())::integer,
         mb.user_id = (select auth.uid())
  from members mb
  left join req r on true
  left join public.picks k on k.user_id = mb.user_id and k.bout_id = r.id and k.bout_version = r.version
  group by mb.user_id
  order by count(r.id) filter (where k.user_id is not null), public.league_display_name(mb.user_id);
end;
$$;

revoke execute on function public.league_pick_status(uuid, uuid) from public, anon;
grant execute on function public.league_pick_status(uuid, uuid) to authenticated;
