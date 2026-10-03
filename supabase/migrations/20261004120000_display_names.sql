-- Display names.
--
-- Every player picks a handle during onboarding before they can enter the
-- app, so leaderboards always have a name to show. Handles are 3 to 20
-- letters, digits or underscores, and unique ignoring case: "Striker" and
-- "STRIKER" are the same name. A deleted account's tombstone has no name,
-- which frees its handle for someone else.

-- Nothing set a name before onboarding existed, but clear any that would
-- break the new rule so those accounts are sent through onboarding instead.
update public.profiles set display_name = null
where display_name is not null and display_name !~ '^[A-Za-z0-9_]{3,20}$';

alter table public.profiles drop constraint profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_handle
  check (display_name ~ '^[A-Za-z0-9_]{3,20}$');

-- If two accounts already shared a name ignoring case, keep it on the oldest.
update public.profiles p set display_name = null
where p.display_name is not null and exists (
  select 1 from public.profiles q
  where lower(q.display_name) = lower(p.display_name)
    and (q.created_at, q.id) < (p.created_at, p.id)
);

create unique index profiles_display_name_unique on public.profiles (lower(display_name));

-- Whether a handle is free. Players can only read their own profile, so this
-- answers the one question onboarding needs without exposing anyone else's
-- row. Your own current name counts as free, so re-saving it is not refused.
-- The unique index is still what enforces it; this is for the live hint.
create function public.display_name_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select name ~ '^[A-Za-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles
      where lower(display_name) = lower(name)
        and id is distinct from (select auth.uid())
    );
$$;

revoke execute on function public.display_name_available(text) from public, anon;
grant execute on function public.display_name_available(text) to authenticated;
