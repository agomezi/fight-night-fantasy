-- Removed names: the app tells the player instead of starting onboarding.
--
-- When the blocked-name list or the owner clears a player's name, the player
-- had no name again and was sent back through onboarding as if new. Now the
-- profile records the removal:
--
--   name_removed_at  when the name was last removed; cleared once the player
--                    picks a new one. While it's set, the app asks for a new
--                    name in a card on Home instead of onboarding.
--   names_removed    how many times a name of theirs has been removed, for
--                    the owner deciding on a ban. Never shown to anyone else.
--
-- Only the two clears that remove a name for breaking the rules count: the
-- blocked-name list (clear_blocked_names, which the loader runs) and the
-- owner's or a moderator's reset (reset_display_name). Each marks its own
-- update, so any other clear (a player's own, a deleted account, a data fix)
-- isn't a removal. Players read both columns on their own row only (the
-- profile's select policy); they can't write them.

alter table public.profiles
  add column name_removed_at timestamptz,
  add column names_removed integer not null default 0;

create function public.track_name_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is not null then
    new.name_removed_at := null;
  elsif old.display_name is not null
        and new.deleted_at is null
        and current_setting('fnf.name_removal', true) = 'on' then
    new.name_removed_at := now();
    new.names_removed := old.names_removed + 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.track_name_removal() from public, anon, authenticated;

create trigger profiles_track_name_removal before update of display_name on public.profiles
  for each row execute function public.track_name_removal();

-- As before, except that a removal isn't held to the weekly name-change
-- limit: a moderator removing a name chosen this week runs as a player, and
-- was refused.
create or replace function public.track_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review bigint;
begin
  -- A deleted account lets go of a held name, even one deleted with no name.
  if new.deleted_at is not null then
    update public.moderation_cases set held_name = null where player = old.id and held_name is not null;
  end if;

  if new.display_name is not distinct from old.display_name then
    return new;
  end if;

  -- A deleted account's personal data goes immediately, its past names and
  -- any reports naming it included.
  if new.deleted_at is not null then
    delete from public.display_name_history where user_id = old.id;
    delete from public.name_reports where reported_id = old.id;
    return new;
  end if;

  -- Set by moderate() for the one update that restores a held name.
  if current_setting('fnf.name_restore', true) = old.id::text then
    if old.display_name is not null then
      insert into public.display_name_history (user_id, display_name) values (old.id, old.display_name);
    end if;
    new.name_changed_at := null;
    return new;
  end if;

  -- Players are held to the limit; a reset run by the owner is not, and
  -- neither is a removal, which a moderator runs from their own session.
  -- Taking a name for the first time, or again after a reset, is always
  -- allowed. This function runs as its owner, so the caller's role is read
  -- from the session rather than current_user.
  if current_setting('role', true) in ('anon', 'authenticated') and old.display_name is not null
     and current_setting('fnf.name_removal', true) is distinct from 'on' then
    perform public.require_good_standing(old.id);
    -- Changing only the case of the letters doesn't count: it stays hidden.
    if new.display_name is not null and lower(new.display_name) <> lower(old.display_name) then
      select c.id into review from public.moderation_cases c
      where c.player = old.id and c.status = 'open' and c.renamed_at is null
        and (c.held_name is null or lower(c.held_name) = lower(old.display_name)) and public.name_hidden(old.id)
      for update;
    end if;
    if review is not null then
      update public.moderation_cases
      set renamed_at = now(), held_name = coalesce(held_name, old.display_name)
      where id = review;
    elsif old.name_changed_at > now() - interval '7 days' then
      raise exception 'You can change your name once a week.'
        using errcode = 'P0001', hint = 'too_soon',
              detail = to_char(old.name_changed_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  if old.display_name is not null then
    insert into public.display_name_history (user_id, display_name) values (old.id, old.display_name);
  end if;
  if new.display_name is not null then
    new.name_changed_at := now();
  end if;
  return new;
end;
$$;

-- Clears every name the current list blocks, as a removal. Returns how many
-- names were cleared.
create or replace function public.clear_blocked_names()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleared integer;
begin
  perform set_config('fnf.name_removal', 'on', true);
  update public.profiles set display_name = null
  where display_name is not null and public.display_name_blocked(display_name);
  get diagnostics cleared = row_count;
  perform set_config('fnf.name_removal', '', true);
  return cleared;
end;
$$;

revoke execute on function public.clear_blocked_names() from public, anon, authenticated;

-- Clears a player's name, as a removal. They keep their picks and scores and
-- are asked for a new name the next time they open the app. The old name
-- stays in the history.
create or replace function public.reset_display_name(player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('fnf.name_removal', 'on', true);
  update public.profiles set display_name = null where id = player;
  perform set_config('fnf.name_removal', '', true);
end;
$$;

revoke execute on function public.reset_display_name(uuid) from public, anon, authenticated;

-- Players with names removed, most first, for the owner in the SQL editor.
-- Deleted accounts are left out.
create view public.name_removals with (security_invoker = true) as
select p.id as player,
       p.display_name as current_name,
       p.names_removed,
       p.name_removed_at as waiting_since,
       (select array_agg(h.display_name order by h.changed_at desc, h.id desc)
        from public.display_name_history h where h.user_id = p.id) as past_names
from public.profiles p
where p.names_removed > 0 and p.deleted_at is null
order by p.names_removed desc, p.id;

revoke all on public.name_removals from public, anon, authenticated;
