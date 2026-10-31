-- League drops: the league page shows a drop's card for a week after it's
-- published, or until the next card locks if that's later; after that the
-- drop lives in a list under the standings.
--
-- latest_award_drop() keeps its shape for older builds; v2 adds when the drop
-- was published and when the first card after that locks, so the app can tell
-- when to stop showing it.

-- The newest published drop this season, with its publish time and the lock
-- of the first card after it (null when no such card is on the schedule yet).
create function public.latest_award_drop_v2()
returns table (id uuid, label text, kind text, ran_at timestamptz, published_at timestamptz, next_lock_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.label, d.kind, d.ran_at, d.published_at,
         (select min(e.locks_at) from public.events e
          where e.locks_at > d.published_at and e.status <> 'cancelled')
  from public.award_drops d
  where d.published_at is not null and d.season_id is not distinct from public.current_season()
    and (select auth.uid()) is not null
  order by d.ran_at desc limit 1;
$$;

-- This season's published drops that have something for this league, newest
-- first, for its members, with the same next lock as v2 so the app can leave
-- out the one still on the league page. Each one opens with
-- league_award_drop(league, id).
create function public.league_award_drops(league uuid)
returns table (id uuid, label text, kind text, ran_at timestamptz, published_at timestamptz, next_lock_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_league_member(league);
  return query
    select d.id, d.label, d.kind, d.ran_at, d.published_at,
           (select min(e.locks_at) from public.events e
            where e.locks_at > d.published_at and e.status <> 'cancelled')
    from public.award_drops d
    where d.published_at is not null
      and d.season_id is not distinct from public.current_season()
      and (exists (select 1 from public.drop_awards a where a.drop_id = d.id and a.scope = league::text)
           or exists (select 1 from public.drop_stats s where s.drop_id = d.id and s.scope = league::text))
    order by d.published_at desc, d.ran_at desc;
end;
$$;

revoke execute on function public.latest_award_drop_v2(), public.league_award_drops(uuid) from public, anon;
grant execute on function public.latest_award_drop_v2(), public.league_award_drops(uuid) to authenticated;
