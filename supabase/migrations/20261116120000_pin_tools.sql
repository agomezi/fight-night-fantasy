-- Managing pinned calls from the profile: a list of the calls you could pin,
-- for the "Pin a call" sheet, and moving a pin to the top.

-- Your calls that can be pinned (correct, on a final result, picked as the
-- bout stands), newest card first, with whether each is pinned already and
-- whether you backed the underdog.
create function public.my_pinnable_calls()
returns table (
  bout_id      uuid,
  event_name   text,
  event_date   timestamptz,
  red_name     text,
  blue_name    text,
  picked_name  text,
  finish       public.finish_kind,
  finish_round smallint,
  method       public.pick_method,
  points       integer,
  underdog     boolean,
  pinned       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.bout_id, e.name, e.starts_at, rf.name, bf.name, pf.name, k.finish, k.finish_round, k.method, s.points,
         b.underdog_corner is not null
           and b.underdog_corner::text = case when k.picked_fighter_id = b.red_fighter_id then 'red' else 'blue' end,
         exists (select 1 from public.pinned_picks p where p.user_id = k.user_id and p.bout_id = k.bout_id)
  from public.picks k
  join public.bouts b on b.id = k.bout_id and k.bout_version = b.version
  join public.events e on e.id = b.event_id
  join public.fighters rf on rf.id = b.red_fighter_id
  join public.fighters bf on bf.id = b.blue_fighter_id
  join public.fighters pf on pf.id = k.picked_fighter_id
  join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id and s.correct and s.counts_for_accuracy
  join public.results r on r.bout_id = k.bout_id and r.status = 'final'
  where k.user_id = (select auth.uid())
  order by e.starts_at desc, b.fight_order;
$$;

-- Pins are shown newest first, so each takes the moment it was made, not
-- its transaction's start.
alter table public.pinned_picks alter column pinned_at set default clock_timestamp();

-- Puts one of your pins first on your profile.
create function public.move_pin_to_top(bout uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pinned_picks p set pinned_at = clock_timestamp()
  where p.user_id = (select auth.uid()) and p.bout_id = bout;
$$;

revoke execute on function public.my_pinnable_calls(), public.move_pin_to_top(uuid) from public, anon;
grant execute on function public.my_pinnable_calls(), public.move_pin_to_top(uuid) to authenticated;
