-- No rank until a pick has scored.
--
-- A player whose picks haven't been scored yet sat on 0 points, and in a Pro
-- league, where totals go negative, that ranked them above everyone who had
-- played and lost points (2026-10-10: two unscored picks ranked first). Now
-- a member is unranked (NR) until at least one of their picks has scored this
-- season. They still show in the table, below the ranked players.

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
