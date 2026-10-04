-- The blocked-names loader, for databases that ran the first version of the
-- blocked-names migration.
--
-- That version carried the list inside the migration. The list now lives
-- outside the repository and is loaded with scripts/load-blocked-names.mjs,
-- which needs these two functions. A database that already ran the current
-- version has them; `create or replace` makes this a no-op there.

-- Clears every name the current list blocks. Those players pick a new one in
-- onboarding the next time they open the app; their picks and scores are
-- untouched. The loader runs it after loading the list. Returns how many
-- names were cleared.
create or replace function public.clear_blocked_names()
returns integer
language sql
security definer
set search_path = ''
as $$
  with cleared as (
    update public.profiles set display_name = null
    where display_name is not null and public.display_name_blocked(display_name)
    returning 1
  )
  select count(*)::integer from cleared;
$$;

revoke execute on function public.clear_blocked_names() from public, anon, authenticated;

-- Replaces the whole list with `terms` ([{"term": ..., "match": ...}]) and
-- clears the names it now blocks, in one statement, so a failed load leaves
-- the old list in place. Returns how many names were cleared.
create or replace function public.replace_blocked_names(terms jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.blocked_name_terms;
  insert into public.blocked_name_terms (term, match)
  select t->>'term', t->>'match' from jsonb_array_elements(terms) t;
  return public.clear_blocked_names();
end;
$$;

revoke execute on function public.replace_blocked_names(jsonb) from public, anon, authenticated;
