-- Blocked display names.
--
-- Handles show on profiles and leaderboards, so offensive names and names
-- that impersonate the app are refused. The check lives in the database, so
-- every client is held to it, including builds already installed.
--
-- The terms themselves are not in this repository. This migration creates an
-- empty list; the owner loads it from a gitignored file (.env.blocked-names)
-- with scripts/load-blocked-names.mjs, which also clears any name that the
-- loaded list now blocks. Each term has a match mode:
--
--   contains  blocked anywhere in the name. For terms with no innocent use.
--   word      blocked as the whole name or one underscore-separated part of
--             it. For short terms that hide inside ordinary words.
--   name      blocked only as the whole name, ignoring digits and
--             underscores. For reserved names that are fine inside a longer
--             handle.
--
-- Names are compared after undoing the usual disguises: case, digits used as
-- letters (b4dw0rd), underscores between letters and repeated letters. That
-- squeezing also shortens terms with doubled letters, so a short term, or one
-- that hides inside ordinary words or real names, belongs in `word` rather
-- than `contains`.

create table public.blocked_name_terms (
  term  text primary key check (term = lower(term) and term ~ '^[a-z0-9]+$'),
  match text not null check (match in ('contains', 'word', 'name'))
);

-- Not readable by any client: the list is only ever used through the checks.
alter table public.blocked_name_terms enable row level security;
revoke all on public.blocked_name_terms from anon, authenticated;

-- Lowercase, digits read as letters, everything but letters dropped, runs of
-- one letter squeezed to one ("niiigga" and "n_i_g_g_a" read the same).
create function public.normalize_handle(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(translate(lower(name), '01345678', 'oieasgtb'), '[^a-z]', '', 'g'),
    '(.)\1+', '\1', 'g'
  );
$$;

create function public.display_name_blocked(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_name_terms t
    where case t.match
      when 'contains' then
        public.normalize_handle(name) like '%' || public.normalize_handle(t.term) || '%'
      when 'word' then
        public.normalize_handle(name) = public.normalize_handle(t.term)
        or exists (
          select 1 from regexp_split_to_table(name, '_+') part
          where public.normalize_handle(part) = public.normalize_handle(t.term)
        )
      else
        regexp_replace(lower(name), '[^a-z]', '', 'g') = t.term
    end
  );
$$;

-------------------------------------------------------------------------------
-- Enforcement
-------------------------------------------------------------------------------

-- Runs as the table owner: players cannot call display_name_blocked or read
-- the list themselves.
create function public.guard_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is not null
     and new.display_name is distinct from old.display_name
     and public.display_name_blocked(new.display_name) then
    raise exception 'That name isn''t allowed.' using errcode = 'P0001', hint = 'blocked';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_display_name before update of display_name on public.profiles
  for each row execute function public.guard_display_name();

-- What onboarding shows as you type: 'free', 'taken', 'blocked' or 'invalid'.
create function public.display_name_status(name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when name !~ '^[A-Za-z0-9_]{3,20}$' then 'invalid'
    when public.display_name_blocked(name) then 'blocked'
    when exists (
      select 1 from public.profiles
      where lower(display_name) = lower(name) and id is distinct from (select auth.uid())
    ) then 'taken'
    else 'free'
  end;
$$;

-- Builds already installed ask this one; a blocked name now reads as not
-- available there too.
create or replace function public.display_name_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.display_name_status(name) = 'free';
$$;

revoke execute on function public.display_name_blocked(text) from public, anon, authenticated;
revoke execute on function public.display_name_status(text) from public, anon;
grant execute on function public.display_name_status(text) to authenticated;

-------------------------------------------------------------------------------
-- Cleanup
-------------------------------------------------------------------------------

-- Clears every name the current list blocks. Those players pick a new one in
-- onboarding the next time they open the app; their picks and scores are
-- untouched. The loader runs it after loading the list. Returns how many
-- names were cleared.
create function public.clear_blocked_names()
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
create function public.replace_blocked_names(terms jsonb)
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
