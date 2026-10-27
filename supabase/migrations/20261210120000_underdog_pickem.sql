-- No underdog in a pick'em.
--
-- Any gap in the line used to make an underdog, so −108 vs. −110 handed one
-- side the 1.5x bonus over a near coin flip, and a one-point move gave it to
-- the other side. Now the underdog has to be at even money or longer (a
-- price that implies at most 50%) and less likely than the other side. When
-- both lines are minus money, or level, the fight has no underdog: no tag and
-- no bonus.
--
-- Bouts that have locked keep the underdog they froze with, so finished cards
-- re-score exactly as before. Open bouts are recomputed from their stored
-- line. Card news already ignores an underdog going away, so a bout that
-- becomes a pick'em sends nothing; a later move to the other side still does.

-- Even money is checked by its chance rather than its sign: the consensus
-- price stores an exact 50% as -100. `create or replace` keeps the function's
-- grants; `record_odds` runs as the odds sync's role and calls it.
create or replace function public.underdog_of(red_odds integer, blue_odds integer)
returns public.corner
language sql
immutable
set search_path = ''
as $$
  select case
    when public.implied_probability(red_odds) <= 0.5
         and public.implied_probability(red_odds) < public.implied_probability(blue_odds) then 'red'::public.corner
    when public.implied_probability(blue_odds) <= 0.5
         and public.implied_probability(blue_odds) < public.implied_probability(red_odds) then 'blue'::public.corner
  end
$$;

-- The same bouts `record_odds` may still write: scheduled and not yet locked.
update public.bouts b set
  underdog_corner = public.underdog_of(b.red_odds, b.blue_odds)
from public.events e
where e.id = b.event_id
  and b.status = 'scheduled'
  and coalesce(b.locks_at, e.locks_at) > now()
  and b.red_odds is not null
  and b.underdog_corner is distinct from public.underdog_of(b.red_odds, b.blue_odds);
