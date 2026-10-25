-- A league's rules by invite code, so a player can read them before joining:
-- its name, tier, how many players are in its rotation, and the minimum picks
-- for the next card to lock (Pro and Hardcore only; Casual and Amateur
-- require their whole tier range, so scope is null). Never names a member. An
-- unknown code returns no row, the same as join_league's not_found.
--
-- `members` counts the rotation the way league_matchups does: during a season
-- only active members, in pre-season everyone who hasn't left. `queued` says
-- joining now waits for the next season; `is_full` that join_league would refuse.

create function public.league_preview(code text)
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
stable
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

  return query
  with lg as (
    select l.id, l.name, l.tier from public.leagues l
    where l.invite_code = lower(btrim(coalesce(code, '')))
  ),
  card as (
    select e.locks_at from public.events e
    where e.status = 'scheduled' and e.locks_at > now()
    order by e.locks_at limit 1
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

revoke execute on function public.league_preview(text) from public, anon;
grant execute on function public.league_preview(text) to authenticated;

-- Which of the caller's leagues have had a card lock since they were made.
-- Past that, an owner's setup steps are no use.
create function public.my_leagues_started()
returns table (league_id uuid, started boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         exists (select 1 from public.events e
                 where e.status <> 'cancelled' and e.locks_at <= now() and e.locks_at >= l.created_at)
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  where m.user_id = (select auth.uid()) and m.left_at is null;
$$;

revoke execute on function public.my_leagues_started() from public, anon;
grant execute on function public.my_leagues_started() to authenticated;
