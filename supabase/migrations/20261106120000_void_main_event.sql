-- A voided main event pick is no fight, as voids leave no mark anywhere
-- else: a pick made before the opponent changed, or a main event that ends
-- in a no contest or a draw (then the card counts for nobody). A cancelled
-- main event still hands the title to the next bout, as before.

-- As before, leaving out anyone whose main event pick was voided.
create or replace function public.settle_card(event uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.card_results where event_id = event;

  with main_event as (
    select b.id from public.bouts b
    where b.event_id = event and b.status = 'scheduled'
    order by b.fight_order limit 1
  ),
  fighters as (
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
    where k.bout_id = (select id from main_event)
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

-- Cards already settled, again under the new rule.
select public.settle_event(e.id)
from public.events e
where e.status = 'complete'
  and e.season_id is not distinct from public.current_season();
