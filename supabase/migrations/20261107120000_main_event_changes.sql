-- When the main event changes fighters.
--
-- Before it locks: every pick on it is void (the pick no longer counts, as
-- before), and everyone who made one is told to pick again. That's a change
-- of opponent or a whole new pairing alike.
--
-- After it locks: nobody could pick again, so it is treated as if it never
-- happened. The co-main stands in as the main event for the pro record and
-- for Pro's required pick.
--
-- A main event ending in a draw or no contest stays void: those picks count
-- for nothing, so the card counts for nobody on the pro record.
--
-- A pick made before a change counts as no pick wherever picks are counted:
-- the lock reminders and each tier's required picks.

-------------------------------------------------------------------------------
-- When a bout last changed fighters
-------------------------------------------------------------------------------

alter table public.bouts add column version_changed_at timestamptz;

-- As before, also recording when it happened.
create or replace function public.bump_bout_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if least(new.red_fighter_id, new.blue_fighter_id) is distinct from least(old.red_fighter_id, old.blue_fighter_id)
     or greatest(new.red_fighter_id, new.blue_fighter_id) is distinct from greatest(old.red_fighter_id, old.blue_fighter_id) then
    new.version := old.version + 1;
    new.version_changed_at := now();
  end if;
  return new;
end;
$$;

-- True when a bout changed fighters once its picks had locked: nobody could
-- pick the new pairing, so it doesn't count as part of the card.
create function public.changed_after_lock(bout uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.version_changed_at >= coalesce(b.locks_at, e.locks_at), false)
  from public.bouts b join public.events e on e.id = b.event_id
  where b.id = bout;
$$;

revoke execute on function public.changed_after_lock(uuid) from public, anon, authenticated;

-- The card's main event as the pro record counts it: the first bout still on
-- the card, passing over one that changed fighters after it locked.
create function public.pro_main_event(event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.bouts b
  where b.event_id = event and b.status = 'scheduled' and not public.changed_after_lock(b.id)
  order by b.fight_order
  limit 1;
$$;

revoke execute on function public.pro_main_event(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- The pro record
-------------------------------------------------------------------------------

-- As before, with the main event from pro_main_event.
create or replace function public.settle_card(event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.card_results where event_id = event;

  with fighters as (
    select k.user_id,
           coalesce((
             select sum(s.points) from public.scores s
             join public.bouts b on b.id = s.bout_id
             where s.user_id = k.user_id and b.event_id = event
               and (b.card_segment is null or b.card_segment = 'main')
           ), 0)::integer as points,
           coalesce((
             select s.points from public.scores s where s.user_id = k.user_id and s.bout_id = k.bout_id
           ), 0) as me_points
    from public.picks k
    join public.profiles p on p.id = k.user_id
    where k.bout_id = public.pro_main_event(event)
      -- Deleted and banned accounts don't make up the field.
      and p.deleted_at is null
      and (select ps.standing from public.player_standing(p.id) ps) is distinct from 'banned'
      -- A voided pick is no fight.
      and exists (
        select 1 from public.scores s
        where s.user_id = k.user_id and s.bout_id = k.bout_id and s.counts_for_accuracy
      )
  ),
  ranked as (
    select f.*,
           count(*) over () as field,
           rank() over (order by f.points desc, f.me_points desc) as place,
           row_number() over (order by f.points desc, f.me_points desc) as pos
    from fighters f
  ),
  cut as (
    -- The top half win: half rounded up, so an odd field's middle player too.
    select (select count(*) from ranked)::integer as n,
           ceil((select count(*) from ranked) / 2.0)::integer as k
  ),
  line as (
    -- The last winner's and first loser's scores; level on both is a draw.
    select (select row(r.points, r.me_points) from ranked r, cut where r.pos = cut.k) as last_in,
           (select row(r.points, r.me_points) from ranked r, cut where r.pos = cut.k + 1) as first_out
  )
  insert into public.card_results (event_id, user_id, points, main_event_points, field, result)
  select event, r.user_id, r.points, r.me_points, r.field,
         case
           when l.last_in = l.first_out and row(r.points, r.me_points) = l.last_in then 'D'
           when r.place <= c.k then 'W'
           else 'L'
         end
  from ranked r, cut c, line l
  where c.n >= 3;
$$;

revoke execute on function public.settle_card(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Required picks
-------------------------------------------------------------------------------

-- As before, but a pick made before the bout changed fighters isn't one, and
-- a bout that changed after it locked isn't required (for Pro, the co-main
-- is then the main event).
create or replace function public.met_tier_picks(tier public.league_tier, player uuid, event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with bouts as (
    select b.id, b.fight_order,
           exists (
             select 1 from public.picks p
             where p.bout_id = b.id and p.user_id = player and p.bout_version = b.version
           ) as picked
    from public.bouts b
    where b.event_id = event and b.status = 'scheduled' and public.bout_counts_for_tier(tier, b.id)
      and not public.changed_after_lock(b.id)
  )
  select case
    when not exists (select 1 from bouts) then false
    when tier in ('pro', 'hardcore') then (select bo.picked from bouts bo order by bo.fight_order limit 1)
    else not exists (select 1 from bouts bo where not bo.picked)
  end;
$$;

revoke execute on function public.met_tier_picks(public.league_tier, uuid, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Lock reminders
-------------------------------------------------------------------------------

-- As before, counting only picks made on the bout as it stands, with the
-- main event the first bout still on the card.
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
          where k.user_id = p.id and b.id = public.pro_main_event(d.id) and k.bout_version = b.version
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

-------------------------------------------------------------------------------
-- Telling players to pick again
-------------------------------------------------------------------------------

-- When the main event changes fighters before it locks, everyone who picked
-- it hears straight away. It's a 'reminder' keyed "<bout>:v<version>", so it
-- shares the reminders toggle and the inbox.
create function public.queue_main_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events%rowtype;
begin
  select * into ev from public.events e where e.id = new.event_id;
  if new.status <> 'scheduled' or coalesce(new.locks_at, ev.locks_at) <= now()
     or new.id is distinct from public.pro_main_event(new.event_id) then
    return null;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select k.user_id, 'reminder', new.id || ':v' || new.version,
         jsonb_build_object(
           'event', ev.name,
           'section', 'changed',
           'red', (select f.name from public.fighters f where f.id = new.red_fighter_id),
           'blue', (select f.name from public.fighters f where f.id = new.blue_fighter_id)
         ),
         false
  from public.picks k
  join public.profiles p on p.id = k.user_id
  where k.bout_id = new.id and k.bout_version < new.version and p.deleted_at is null
  on conflict do nothing;

  if found then
    perform public.invoke_activity_push();
  end if;
  return null;
end;
$$;

revoke execute on function public.queue_main_event_change() from public, anon, authenticated;

create trigger bouts_main_event_change after update on public.bouts
  for each row when (new.version > old.version)
  execute function public.queue_main_event_change();

-- As before, with reminders following the reminders toggle.
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
    case c.kind
      when 'moderation' then true
      when 'reminder' then p.notify_reminders
      else p.notify_league_activity
    end and c.sent_at > now() - interval '1 day'
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;

-------------------------------------------------------------------------------
-- Cards already settled, again under the new rule
-------------------------------------------------------------------------------

select public.settle_event(e.id)
from public.events e
where e.status = 'complete'
  and e.season_id is not distinct from public.current_season();
