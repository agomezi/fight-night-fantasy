-- The global leaderboard ranks by edge.
--
-- It ranked by total points, so picking two fights and losing a little beat
-- picking the whole card and losing more. Edge is how far above the average
-- player you score on the same fights: on each fight you pick, your points
-- minus the average of everyone who picked it; your edge is the sum. Beating
-- the field on fight after fight is what climbs, a fight everyone gets right
-- earns nothing extra, and an average player sits near 0 whatever the night.
--
-- A card counts only if you picked its whole main card; prelims you added on
-- such a card count too. A fight counts once at least 3 such players picked
-- it, so one with almost no pickers can't swing anyone. Skipping is neither
-- rewarded nor punished: a card you didn't commit to, or a fight you didn't
-- pick, is simply 0. Points and accuracy still show, over every pick.

drop function public.season_leaderboard(integer);

create function public.season_leaderboard(max_rows integer default 100)
returns table (
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
  -- Cards each player picked the whole main card of.
  committed as (
    select k.user_id, mc.event_id
    from main_card mc
    join public.picks k on k.bout_id = mc.id and k.bout_version = mc.version
    group by k.user_id, mc.event_id
    having count(*) = (select count(*) from main_card x where x.event_id = mc.event_id)
  ),
  -- Their scored picks on those cards.
  field as (
    select s.user_id, s.bout_id, s.points
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
    select f.user_id, round(sum(f.points - ft.average))::bigint as edge
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
    select e.user_id, e.edge,
           coalesce(t.points, 0) as points, coalesce(t.correct, 0) as correct, coalesce(t.counted, 0) as counted,
           (select count(*) from committed c where c.user_id = e.user_id) as cards
    from edges e
    left join totals t on t.user_id = e.user_id
  ),
  standing as (
    select b.user_id, (select ps.standing from public.player_standing(b.user_id) ps) as standing
    from board b
  ),
  ranked as (
    select rank() over (
             order by b.edge desc,
                      case when b.counted = 0 then 0 else b.correct::numeric / b.counted end desc
           ) as rank,
           b.user_id,
           case
             when public.blocked_by_me(b.user_id) then 'Blocked player'
             when st.standing = 'suspended' then 'Suspended'
             when b.user_id is distinct from (select auth.uid()) and public.name_hidden(b.user_id) then 'Player'
             else p.display_name
           end as display_name,
           b.edge, b.points, b.correct, b.counted, b.cards,
           b.user_id = (select auth.uid()) as is_me
    from board b
    join public.profiles p on p.id = b.user_id
    join standing st on st.user_id = b.user_id
    where p.deleted_at is null and p.display_name is not null and st.standing <> 'banned'
  )
  select r.rank, r.user_id, r.display_name, r.edge, r.points, r.correct, r.counted, r.cards, r.is_me,
         coalesce((select 'SEASON ' || number from season), 'PRE-SEASON')
  from ranked r
  where r.rank <= greatest(max_rows, 1) or r.is_me
  order by r.rank, r.display_name;
$$;

revoke execute on function public.season_leaderboard(integer) from public, anon;
grant execute on function public.season_leaderboard(integer) to authenticated;
