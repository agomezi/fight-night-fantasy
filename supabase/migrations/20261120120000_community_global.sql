-- Home's community card is about everyone on the app, not one league.
--
--   fight night       the main-event take, with its split and the crowd's pick
--   card final +2d    the card's top performers, and how the main-event take went
--   fight week        a day each for the main-event take, a hot take and crowd vs. reality
--   otherwise         crowd vs. reality or the last card's top performers, a day each
--
-- Crowd vs. reality is the fight on the last card the crowd got most wrong:
-- "84% picked X. Y won by KO in round 2." It only shows once the card is final.
--
-- The league cards (Top Predictor, Can Man, Craftiest Pick, Jobber) move to
-- the league's own page, through league_community_card(league).

-------------------------------------------------------------------------------
-- Crowd vs. reality
-------------------------------------------------------------------------------

-- The fight where the most players picked the loser, with at least 3 picks and
-- a majority wrong. Null when the crowd got every fight right.
create function public.crowd_vs_reality(event uuid, me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with out_ as (
    select x.user_id from public.sidelined_players() x
  ),
  fights as (
    select b.id, b.fight_order, r.winner_fighter_id, r.method, r.round,
           case when r.winner_fighter_id = b.red_fighter_id then b.blue_fighter_id else b.red_fighter_id end as loser_id,
           count(*)::int as picks,
           count(*) filter (where k.picked_fighter_id <> r.winner_fighter_id)::int as wrong
    from public.bouts b
    join public.results r on r.bout_id = b.id and r.status = 'final' and r.void_reason is null
      and r.winner_fighter_id is not null
    join public.picks k on k.bout_id = b.id and k.bout_version = b.version
    where b.event_id = event and b.status = 'scheduled' and not public.changed_after_lock(b.id)
      and not exists (select 1 from out_ o where o.user_id = k.user_id)
    group by b.id, b.fight_order, b.red_fighter_id, b.blue_fighter_id, r.winner_fighter_id, r.method, r.round
    having count(*) >= 3
  ),
  worst as (
    select f.* from fights f
    where f.wrong * 2 > f.picks
    order by f.wrong::numeric / f.picks desc, f.picks desc, f.fight_order
    limit 1
  )
  select jsonb_build_object(
    'type', 'crowd',
    'event_name', (select e.name from public.events e where e.id = event),
    'crowd_fighter', (select f.name from public.fighters f where f.id = w.loser_id),
    'pct', round(100.0 * w.wrong / w.picks)::int,
    'winner', (select f.name from public.fighters f where f.id = w.winner_fighter_id),
    'method', w.method,
    'round', w.round,
    -- How the crowd did across the card: fights where most picked the winner.
    'right', (select count(*) from fights f where f.wrong * 2 < f.picks),
    'fights', (select count(*) from fights),
    -- 'crowd' if you went with them, 'against' if you had the winner, null if
    -- you didn't pick it (or picked against the current fighters).
    'me', (select case when k.picked_fighter_id = w.winner_fighter_id then 'against' else 'crowd' end
           from public.picks k join public.bouts b on b.id = k.bout_id and k.bout_version = b.version
           where k.bout_id = w.id and k.user_id = me)
  )
  from worst w;
$$;

-------------------------------------------------------------------------------
-- The last final card
-------------------------------------------------------------------------------

-- The last card whose results are final, and when it went final. One that went
-- final since the cron last ran counts from `at`.
create function public.last_final_event(at timestamptz)
returns table (event_id uuid, final_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, coalesce(f.final_at, at)
  from public.events e
  left join public.community_finals f on f.event_id = e.id
  where f.event_id is not null
     or (e.status = 'complete' and e.locks_at <= at and e.starts_at > at - interval '3 days'
         and public.event_is_final(e.id))
  order by e.starts_at desc limit 1;
$$;

-------------------------------------------------------------------------------
-- Home
-------------------------------------------------------------------------------

-- `league` is no longer used; it stays so older builds keep working.
create or replace function public.community_card_at(league uuid, me uuid, at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  night    uuid;
  last_ev  uuid;
  final_at timestamptz;
  nxt      uuid;
  poll     uuid;
  day      integer := ((at at time zone 'America/New_York')::date - date '2026-01-01');
  card     jsonb;
  slot     text;
begin
  -- Fight night: a card under way (or finished, with results not yet final).
  select e.id into night from public.events e
  where e.status <> 'cancelled' and e.locks_at <= at and e.starts_at > at - interval '3 days'
    and not public.event_is_final(e.id)
  order by e.locks_at desc limit 1;
  if night is not null then
    select p.id into poll from public.community_polls p
    where p.event_id = night and p.kind = 'main_event'
    order by (p.bout_id = public.current_main_event(night)) desc nulls last, p.created_at desc
    limit 1;
    if poll is not null then
      return jsonb_build_object('type', 'poll', 'phase', 'live', 'poll', public.poll_payload(poll, me, at));
    end if;
  end if;

  select l.event_id, l.final_at into last_ev, final_at from public.last_final_event(at) l;

  -- Just final: who did best, and how the main-event take went.
  if last_ev is not null and at < final_at + interval '2 days' then
    card := public.top_performers(last_ev, me);
    if card is not null then
      select p.id into poll from public.community_polls p
      where p.event_id = last_ev and p.kind = 'main_event'
      order by (p.bout_id = public.pro_main_event(last_ev)) desc nulls last, p.created_at desc
      limit 1;
      return card || jsonb_build_object('recap', case when poll is not null then public.poll_payload(poll, me, at) end);
    end if;
  end if;

  -- Fight week: the main-event take, a hot take and crowd vs. reality, a day each.
  select e.id into nxt from public.events e
  where e.status in ('scheduled', 'live') and e.locks_at > at and e.starts_at <= at + interval '6 days'
  order by e.locks_at limit 1;

  if nxt is not null then
    foreach slot in array (case day % 3
      when 0 then array['main', 'hot', 'crowd']
      when 1 then array['hot', 'main', 'crowd']
      else array['crowd', 'main', 'hot'] end)
    loop
      poll := null;
      if slot = 'main' then
        select p.id into poll from public.community_polls p
        where p.event_id = nxt and p.kind = 'main_event' and p.bout_id = public.current_main_event(nxt)
          and p.bout_version = (select b.version from public.bouts b where b.id = p.bout_id)
          and at < public.poll_close_at(p.id)
        order by p.created_at desc limit 1;
      elsif slot = 'hot' then
        select h.id into poll from (
          select p.id, row_number() over (order by p.created_at, p.slug) - 1 as i, count(*) over () as n
          from public.community_polls p
          where p.event_id = nxt and p.kind = 'hot_take' and at < public.poll_close_at(p.id)
            and public.poll_outcome(p.id) is distinct from 'void'
        ) h
        where h.i = (day / 3) % h.n;
      elsif last_ev is not null then
        card := public.crowd_vs_reality(last_ev, me);
        if card is not null then
          return card;
        end if;
      end if;
      if poll is not null then
        return jsonb_build_object('type', 'poll', 'phase', 'open', 'poll', public.poll_payload(poll, me, at));
      end if;
    end loop;
  end if;

  -- Between cards: crowd vs. reality and the last card's best, a day each.
  if last_ev is not null then
    foreach slot in array (case day % 2 when 0 then array['crowd', 'top'] else array['top', 'crowd'] end)
    loop
      card := case slot when 'crowd' then public.crowd_vs_reality(last_ev, me) else public.top_performers(last_ev, me) end;
      if card is not null then
        return card;
      end if;
    end loop;
  end if;

  return '{"type": "none"}'::jsonb;
end;
$$;

-------------------------------------------------------------------------------
-- The league page
-------------------------------------------------------------------------------

-- A league card for `me` at `at`: Top Predictor, Can Man, Craftiest Pick or
-- Jobber from the league's last final card, a different one each day. Null if
-- `me` isn't in the league or none has enough players.
create function public.league_community_card_at(league uuid, me uuid, at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  last_ev uuid;
  day     integer := ((at at time zone 'America/New_York')::date - date '2026-01-01');
  card    jsonb;
  slot    text;
begin
  if not exists (select 1 from public.league_members m
                 where m.league_id = league and m.user_id = me and m.left_at is null) then
    return null;
  end if;
  select l.event_id into last_ev from public.last_final_event(at) l;
  if last_ev is null then
    return null;
  end if;
  foreach slot in array (case day % 4
    when 0 then array['top_predictor', 'losers', 'craftiest', 'jobber']
    when 1 then array['losers', 'craftiest', 'jobber', 'top_predictor']
    when 2 then array['craftiest', 'jobber', 'top_predictor', 'losers']
    else array['jobber', 'top_predictor', 'losers', 'craftiest'] end)
  loop
    card := public.league_card(league, me, last_ev, slot);
    if card is not null then
      return card;
    end if;
  end loop;
  return null;
end;
$$;

create function public.league_community_card(league uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.league_community_card_at(league, (select auth.uid()), now());
$$;

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

revoke execute on function
  public.crowd_vs_reality(uuid, uuid), public.last_final_event(timestamptz),
  public.league_community_card_at(uuid, uuid, timestamptz), public.league_community_card(uuid)
  from public, anon, authenticated;

grant execute on function public.league_community_card(uuid) to authenticated;
