-- A head-to-head's picks, side by side.
--
-- Tapping your matchup shows your picks next to your opponent's, bout by bout,
-- for the part of the card the league plays. A saved pick can be changed
-- until its section starts, so an opponent's pick only shows once its bout
-- has locked: prelim picks when the prelims start, main card picks when the
-- main card does. Before that, all that shows is whether they're locked in,
-- that is, have the picks the league's tier requires. Your own picks always
-- show.

create function public.matchup_picks(league uuid, event uuid, opponent uuid)
returns table (
  bout_id         uuid,
  fight_order     smallint,
  card_segment    public.card_segment,
  -- The bout's section has started, so picks on it are final.
  locked          boolean,
  -- A fighter was replaced after the lock: no fight for anyone.
  voided          boolean,
  red_id          uuid,
  red_name        text,
  blue_id         uuid,
  blue_name       text,
  my_fighter      uuid,
  my_finish       public.finish_kind,
  my_round        smallint,
  my_method       public.pick_method,
  my_points       integer,
  their_fighter   uuid,
  their_finish    public.finish_kind,
  their_round     smallint,
  their_method    public.pick_method,
  their_points    integer,
  their_locked_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  t  public.league_tier;
begin
  perform public.require_league_member(league);
  if not public.shares_league(league, opponent) then
    raise exception 'That player isn''t in this league.' using errcode = 'P0001', hint = 'not_member';
  end if;

  select l.tier into t from public.leagues l where l.id = league;

  return query
  with card as (
    select b.*,
           coalesce(b.locks_at, e.locks_at) <= now() as is_locked,
           public.changed_after_lock(b.id) as is_void
    from public.bouts b
    join public.events e on e.id = b.event_id
    where b.event_id = event and b.status = 'scheduled'
      and public.bout_counts_for_tier(t, b.id)
  ),
  -- Only picks made against the bout as it stands: one from before a
  -- fighter was replaced no longer applies.
  side as (
    select c.id as bout, k.user_id, k.picked_fighter_id, k.finish, k.finish_round, k.method,
           (select case when t = 'casual' then s.casual_points else s.points end
            from public.scores s where s.user_id = k.user_id and s.bout_id = c.id) as pts
    from card c
    join public.picks k on k.bout_id = c.id and k.bout_version = c.version
    where k.user_id in (me, opponent)
  )
  select c.id, c.fight_order, c.card_segment, c.is_locked, c.is_void,
         c.red_fighter_id, rf.name, c.blue_fighter_id, bf.name,
         mine.picked_fighter_id, mine.finish, mine.finish_round, mine.method, mine.pts,
         theirs.picked_fighter_id, theirs.finish, theirs.finish_round, theirs.method, theirs.pts,
         public.met_tier_picks(t, opponent, event)
  from card c
  join public.fighters rf on rf.id = c.red_fighter_id
  join public.fighters bf on bf.id = c.blue_fighter_id
  left join side mine on mine.bout = c.id and mine.user_id = me
  -- Nothing of theirs on a bout that hasn't locked, not even whether it's picked.
  left join side theirs on theirs.bout = c.id and theirs.user_id = opponent and c.is_locked
  order by c.fight_order;
end;
$$;

revoke execute on function public.matchup_picks(uuid, uuid, uuid) from public, anon;
grant execute on function public.matchup_picks(uuid, uuid, uuid) to authenticated;
