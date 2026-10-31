-- A steeper career ladder: each rank takes twice the points of the one
-- before (5, 10, 20, 40, 80), so the top ranks take longer to reach.
--
--   Prospect 0 · Contender 5 · Ranked 15 · Title Challenger 35 ·
--   Champion 75 · Legend 155
--
-- Only Champion and Legend move, and both move up, so nobody reaches a rank
-- sooner and no rank-up is announced twice.

-- Your pro record, streak (+ wins or - losses in a row, newest first; 0 after
-- a draw) and career rank.
create or replace function public.my_career()
returns table (
  wins          integer,
  losses        integer,
  draws         integer,
  cards         integer,
  streak        integer,
  career_points integer,
  rank          text,
  next_rank     text,
  next_at       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.result, e.locks_at, e.id
    from public.card_results c
    join public.events e on e.id = c.event_id
    where c.user_id = (select auth.uid())
  ),
  tally as (
    select count(*) filter (where result = 'W')::integer as w,
           count(*) filter (where result = 'L')::integer as l,
           count(*) filter (where result = 'D')::integer as d,
           count(*)::integer as n
    from mine
  ),
  latest as (
    select m.result, row_number() over (order by m.locks_at desc, m.id desc) as i from mine m
  ),
  run as (
    -- How many of the newest results match the newest one.
    select (select result from latest where i = 1) as result,
           coalesce((select min(i) from latest
                     where result is distinct from (select result from latest where i = 1)),
                    (select count(*) + 1 from latest)) - 1 as len
  ),
  ranks (name, at) as (
    values ('Prospect', 0), ('Contender', 5), ('Ranked', 15), ('Title Challenger', 35),
           ('Champion', 75), ('Legend', 155)
  ),
  pts as (
    select t.n + t.w as p from tally t
  )
  select t.w, t.l, t.d, t.n,
         (case r.result when 'W' then r.len when 'L' then -r.len else 0 end)::integer,
         p.p,
         (select k.name from ranks k where k.at <= p.p order by k.at desc limit 1),
         (select k.name from ranks k where k.at > p.p order by k.at limit 1),
         (select k.at from ranks k where k.at > p.p order by k.at limit 1)
  from tally t, run r, pts p;
$$;

-- The career ladder, as in my_career().
create or replace function public.career_rank_for(points integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when points >= 155 then 'Legend'
    when points >= 75 then 'Champion'
    when points >= 35 then 'Title Challenger'
    when points >= 15 then 'Ranked'
    when points >= 5 then 'Contender'
    else 'Prospect'
  end;
$$;
