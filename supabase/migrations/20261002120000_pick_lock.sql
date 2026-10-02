-- Picks lock on the server.
--
-- Once an event's `locks_at` passes, no client can add, change or remove a
-- pick on any of its bouts, whatever the phone's clock says. The app's
-- countdown only displays this rule; this trigger is the rule.
--
-- Only client roles are held to it. Internal work that runs as the owner or
-- service_role (cascades from a deleted bout, the season-rollover purge of
-- deleted accounts) must still be able to remove picks after lock.

create function public.enforce_pick_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bout_ids uuid[];
  closed   boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  -- Someone else's pick is row-level security's to refuse, which happens after
  -- this trigger; answering "locked" first would misreport it.
  if coalesce(new.user_id, old.user_id) is distinct from (select auth.uid()) then
    return coalesce(new, old);
  end if;

  -- An update is checked against both bouts, so a pick cannot be moved out of
  -- a locked event any more than into one.
  bout_ids := case tg_op
    when 'INSERT' then array[new.bout_id]
    when 'DELETE' then array[old.bout_id]
    else array[old.bout_id, new.bout_id]
  end;

  select bool_or(e.locks_at <= now()) into closed
  from public.bouts b
  join public.events e on e.id = b.event_id
  where b.id = any (bout_ids);

  if closed then
    raise exception 'picks are locked for this event'
      using errcode = 'P0001', hint = 'locked';
  end if;

  if tg_op <> 'DELETE'
     and exists (select 1 from public.bouts where id = new.bout_id and status = 'cancelled') then
    raise exception 'bout % is cancelled', new.bout_id
      using errcode = 'P0001', hint = 'cancelled';
  end if;

  return coalesce(new, old);
end;
$$;

-- Named to sort before `picks_validate`, so a locked event is reported as
-- locked rather than as whatever else is wrong with the pick.
create trigger picks_lock before insert or update or delete on public.picks
  for each row execute function public.enforce_pick_lock();
