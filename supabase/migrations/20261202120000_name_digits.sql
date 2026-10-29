-- Blocked display names: every digit reads as a letter.
--
-- normalize_handle and normalize_handle_loose read 0, 1, 3, 4, 5, 6, 7 and 8
-- as letters but dropped 2 and 9, so a 9 written for a "g" vanished and the
-- term around it no longer matched. Now 9 reads as "g" (like 6) and 2 as
-- "z". Everything else is unchanged.
--
-- Nothing is cleared by this migration. Names this now catches stay until
-- the owner reloads the list (scripts/load-blocked-names.mjs, whose
-- --dry-run lists them first); a player renaming is held to it straight away.

create or replace function public.normalize_handle(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(translate(lower(name), '0123456789', 'oizeasgtbg'), '[^a-z]', '', 'g'),
    '(.)\1+', '\1', 'g'
  );
$$;

create or replace function public.normalize_handle_loose(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(
      replace(replace(
        regexp_replace(translate(lower(name), '0123456789', 'oizeasgtbg'), '[^a-z]', '', 'g'),
        'ph', 'f'), 'vv', 'w'),
      'jlycqzv', 'iiikksu'),
    '(.)\1+', '\1', 'g'
  );
$$;

revoke execute on function public.normalize_handle_loose(text) from public, anon, authenticated;
