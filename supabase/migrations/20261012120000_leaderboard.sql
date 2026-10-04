-- The global leaderboard.
--
-- Every player's points for the current season, ranked, with accuracy beside
-- them. Before the first season opens it ranks the pre-season (cards with no
-- season slot). Ties on points are split by accuracy; players level on both
-- share a rank.
--
-- Players can only read their own scores, so this runs as its owner and
-- returns just what the table shows: name, totals and rank. Only players with
-- a name appear, and deleted accounts never do. The caller's own row is
-- always included, even outside the top `max_rows`.

create function public.season_leaderboard(max_rows integer default 100)
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
  ranked as (
    select rank() over (
             order by t.points desc,
                      case when t.counted = 0 then 0 else t.correct::numeric / t.counted end desc
           ) as rank,
           t.user_id, p.display_name, t.points, t.correct, t.counted, t.cards,
           t.user_id = (select auth.uid()) as is_me
    from totals t
    join public.profiles p on p.id = t.user_id
    where p.deleted_at is null and p.display_name is not null
  )
  select r.rank, r.user_id, r.display_name, r.points, r.correct, r.counted, r.cards, r.is_me,
         coalesce((select 'SEASON ' || number from season), 'PRE-SEASON')
  from ranked r
  where r.rank <= greatest(max_rows, 1) or r.is_me
  order by r.rank, r.display_name;
$$;

revoke execute on function public.season_leaderboard(integer) from public, anon;
grant execute on function public.season_leaderboard(integer) to authenticated;
