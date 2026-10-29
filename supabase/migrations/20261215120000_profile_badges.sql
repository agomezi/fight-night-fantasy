-- Profile badges and the locker: a belt for your career rank and rare,
-- public badges, each of which you can hide from your profile.
--
-- Badges are worked out when read, except OG, which marks the pre-season
-- testers and is set by the owner from the SQL editor before the Season 1
-- launch wipes the pre-season:
--   update public.profiles set preseason_tester = true where id in (...);
-- Legend: the top career rank. Season Veteran: played every card of a
-- finished season. Commissioner: owned a league that played a finished
-- season from its start.

alter table public.profiles
  add column preseason_tester boolean not null default false,
  -- Locker items hidden from your profile and the card others open.
  add column locker_hidden text[] not null default '{}';

-- What the locker can hold. Must match LOCKER_ITEMS in the app.
create function public.locker_items()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['belt', 'og', 'legend', 'season_veteran', 'commissioner'];
$$;

-------------------------------------------------------------------------------
-- Who ran each league each season
-------------------------------------------------------------------------------

-- The owner when a league's first week of a season was saved, kept even if
-- the league changes hands or is deleted later. Only leagues that existed
-- before the season started count.
create table public.league_season_owners (
  league_id uuid not null,
  season_id uuid not null references public.seasons (id) on delete cascade,
  owner_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (league_id, season_id)
);

create index league_season_owners_owner_idx on public.league_season_owners (owner_id);

alter table public.league_season_owners enable row level security;
revoke all on public.league_season_owners from public, anon, authenticated;

create function public.record_league_season_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Saving results must never fail because of this.
  begin
    insert into public.league_season_owners (league_id, season_id, owner_id)
    select l.id, s.id, l.owner_id
    from public.leagues l
    join public.seasons s on s.id = new.season_id
    where l.id = new.league_id and s.starts_at is not null and l.created_at <= s.starts_at
    on conflict do nothing;
  exception when others then
    raise warning 'record_league_season_owner failed: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.record_league_season_owner() from public, anon, authenticated;

create trigger league_results_record_owner after insert on public.league_results
  for each row when (new.season_id is not null)
  execute function public.record_league_season_owner();

-- Seasons already saved: their owner today is the best record there is.
insert into public.league_season_owners (league_id, season_id, owner_id)
select distinct r.league_id, s.id, l.owner_id
from public.league_results r
join public.leagues l on l.id = r.league_id
join public.seasons s on s.id = r.season_id
where s.starts_at is not null and l.created_at <= s.starts_at
on conflict do nothing;

-------------------------------------------------------------------------------
-- Reading it
-------------------------------------------------------------------------------

-- A player's career points, as in my_career(): a point per card, another per win.
create function public.career_points_of(member uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (count(*) + count(*) filter (where c.result = 'W'))::integer
  from public.card_results c
  where c.user_id = member;
$$;

revoke execute on function public.career_points_of(uuid) from public, anon, authenticated;

-- The belt for some career points: the rank, and a stripe for each fifth of
-- the way to the next one (up to four; none at Legend). Must match beltFor()
-- in the app and the ranks in my_career().
create function public.career_belt(points integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with ranks (name, at, next_at) as (
    values ('Prospect', 0, 5), ('Contender', 5, 15), ('Ranked', 15, 35),
           ('Title Challenger', 35, 60), ('Champion', 60, 150), ('Legend', 150, null::integer)
  )
  select jsonb_build_object(
           'rank', r.name,
           'stripes', case when r.next_at is null then 0
                           else least(4, floor((points - r.at) * 5.0 / (r.next_at - r.at)))::integer end)
  from ranks r
  where r.at <= greatest(points, 0)
  order by r.at desc
  limit 1;
$$;

revoke execute on function public.career_belt(integer) from public, anon, authenticated;

-- Seasons that are over: a later one has started, or its end has passed.
create function public.finished_seasons()
returns table (id uuid, number integer, starts_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select s.id, s.number, s.starts_at
  from public.seasons s
  where s.starts_at is not null
    and ((s.ends_at is not null and s.ends_at <= now())
         or exists (select 1 from public.seasons n where n.number > s.number and n.starts_at is not null));
$$;

revoke execute on function public.finished_seasons() from public, anon, authenticated;

-- A player's belt and badges. You see all of yours with what you've hidden;
-- anyone else sees only what you show. Null for a player you've blocked, or
-- one deleted or banned.
create function public.player_locker_v2(member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  who as (
    select p.preseason_tester, p.locker_hidden, member = (select id from me) as mine,
           public.career_points_of(member) as points
    from public.profiles p
    where p.id = member
      and (select id from me) is not null
      and p.deleted_at is null
      and not public.blocked_by_me(member)
      and (select ps.standing from public.player_standing(member) ps) is distinct from 'banned'
  ),
  -- Every settled card of the season (a voided or cancelled one has no results).
  veteran as (
    select s.number from public.finished_seasons() s
    where exists (select 1 from public.card_results c join public.events e on e.id = c.event_id where e.season_id = s.id)
      and not exists (
        select 1 from public.events e
        where e.season_id = s.id
          and exists (select 1 from public.card_results c where c.event_id = e.id)
          and not exists (select 1 from public.card_results c where c.event_id = e.id and c.user_id = member)
      )
  ),
  commish as (
    select distinct s.number
    from public.finished_seasons() s
    join public.league_season_owners o on o.season_id = s.id and o.owner_id = member
  ),
  earned (item, detail) as (
    select 'og', null::jsonb from who where who.preseason_tester
    union all
    select 'legend', null from who where who.points >= 150
    union all
    select 'season_veteran', jsonb_build_object('seasons', jsonb_agg(v.number order by v.number))
    from veteran v having count(*) > 0
    union all
    select 'commissioner', jsonb_build_object('seasons', jsonb_agg(c.number order by c.number))
    from commish c having count(*) > 0
  )
  select jsonb_build_object(
           'belt', case when w.mine or not ('belt' = any (w.locker_hidden)) then public.career_belt(w.points) end,
           'badges', coalesce((
             select jsonb_agg(jsonb_build_object('id', e.item) || coalesce(e.detail, '{}'::jsonb)
                              order by array_position(public.locker_items(), e.item))
             from earned e
             where w.mine or not (e.item = any (w.locker_hidden))
           ), '[]'::jsonb),
           'hidden', case when w.mine then to_jsonb(w.locker_hidden) else '[]'::jsonb end
         )
  from who w;
$$;

revoke execute on function public.player_locker_v2(uuid) from public, anon;
grant execute on function public.player_locker_v2(uuid) to authenticated;

-- Show or hide one of your locker items.
create function public.set_locker_item(item text, shown boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if item is null or shown is null or not (item = any (public.locker_items())) then
    raise exception 'Unknown locker item' using errcode = '22023';
  end if;
  update public.profiles p
     set locker_hidden = case when shown then array_remove(p.locker_hidden, item)
                              else array_append(array_remove(p.locker_hidden, item), item) end
   where p.id = me;
end;
$$;

revoke execute on function public.set_locker_item(text, boolean) from public, anon;
grant execute on function public.set_locker_item(text, boolean) to authenticated;
