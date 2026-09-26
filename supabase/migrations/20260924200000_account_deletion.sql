-- Account deletion.
--
-- Deleting an account erases everything identifying at once: the auth user,
-- its login identities and sessions, and the display name. What stays behind
-- is a tombstone profile (same id, no name, `deleted_at` set) so the current
-- season's league standings and head-to-heads still resolve; leagues show it
-- as a former member. Tombstones are excluded from everything global. At the
-- next season rollover `purge_deleted_accounts` removes them and their rows.

-------------------------------------------------------------------------------
-- Tombstone profiles
-------------------------------------------------------------------------------

-- The profile has to outlive its auth user, so it can no longer cascade from
-- (or reference) auth.users. Profiles are still created only by the sign-up
-- trigger.
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles
  add column deleted_at timestamptz,
  add constraint profiles_tombstone_has_no_name
    check (deleted_at is null or display_name is null);

-- Clients may change their name and nothing else.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- An access token stays valid for up to an hour after its account is deleted.
-- These policies stop such a token from renaming the tombstone or changing
-- picks that are now part of other members' standings.
drop policy "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);

drop policy "own picks" on public.picks;
create policy "own picks" on public.picks
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.deleted_at is null
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.deleted_at is null
    )
  );

-------------------------------------------------------------------------------
-- Deleting an account
-------------------------------------------------------------------------------

-- Runs whichever way the auth user is deleted: the app's `delete_account`, or
-- an admin deleting the user from the dashboard or the Admin API.
create function public.tombstone_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = null, deleted_at = now()
   where id = old.id;

  -- Picks on a card that has not locked yet never counted for anything.
  delete from public.picks p
   using public.bouts b, public.events e
   where p.user_id = old.id
     and b.id = p.bout_id
     and e.id = b.event_id
     and e.locks_at > now();

  -- A queued membership has not joined any standings yet.
  delete from public.league_members
   where user_id = old.id and status = 'queued';

  -- A league they own passes to the longest-standing remaining member,
  -- preferring active over queued; a league with no one else in it goes.
  update public.leagues l
     set owner_id = (
       select m.user_id
         from public.league_members m
         join public.profiles p on p.id = m.user_id
        where m.league_id = l.id
          and m.user_id <> old.id
          and p.deleted_at is null
        order by (m.status = 'active') desc, m.joined_at, m.user_id
        limit 1
     )
   where l.owner_id = old.id
     and exists (
       select 1
         from public.league_members m
         join public.profiles p on p.id = m.user_id
        where m.league_id = l.id
          and m.user_id <> old.id
          and p.deleted_at is null
     );

  delete from public.leagues where owner_id = old.id;

  return old;
end;
$$;

create trigger on_auth_user_deleted before delete on auth.users
  for each row execute function public.tombstone_profile();

-- Called by a signed-in user to delete their own account. Deleting the auth
-- user cascades to its identities, sessions and refresh tokens.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-------------------------------------------------------------------------------
-- Season rollover
-------------------------------------------------------------------------------

-- Removes every tombstone and the rows it left behind, so the new season's
-- leagues carry on without them. Returns how many accounts were purged.
create function public.purge_deleted_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.scores
   where user_id in (select id from public.profiles where deleted_at is not null);
  delete from public.picks
   where user_id in (select id from public.profiles where deleted_at is not null);
  delete from public.league_members
   where user_id in (select id from public.profiles where deleted_at is not null);

  delete from public.profiles where deleted_at is not null;
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts() to service_role;
