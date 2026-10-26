-- Blocked display names: lookalike letters.
--
-- normalize_handle undoes digits used as letters, but a name could still
-- spell a blocked term with letters that look or sound like the real ones: a
-- "j" or an "l" for an "i", "vv" for "w", "ph" for "f". `contains` and `word`
-- terms now also match after those are folded together too.
--
-- Folding merges letters, and then squeezing can shorten a term a lot ("ill"
-- reads as "i"). A term only gets the folded match while it keeps at least 4
-- letters; shorter ones match as before. Folded 3-letter words collide with
-- ordinary short words, so a disguised short term is added to the list as its
-- own term instead.
-- `name`, `group` and `hostile` terms are unchanged: reserved names are exact
-- on purpose, and the pair terms are short words matched anywhere.
--
-- Nothing is cleared by this migration. Names the folding now catches stay
-- until the owner reloads the list (scripts/load-blocked-names.mjs, whose
-- --dry-run lists them first); a player renaming is held to it straight away.

-- normalize_handle, then lookalikes folded: "ph" and "f", "vv" and "w", then
-- i/j/l/y, k/c/q, s/z and u/v, and runs squeezed after folding so that
-- "ck", "kk" and "c" all read as "k".
create function public.normalize_handle_loose(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(
      replace(replace(
        regexp_replace(translate(lower(name), '01345678', 'oieasgtb'), '[^a-z]', '', 'g'),
        'ph', 'f'), 'vv', 'w'),
      'jlycqzv', 'iiikksu'),
    '(.)\1+', '\1', 'g'
  );
$$;

revoke execute on function public.normalize_handle_loose(text) from public, anon, authenticated;

create or replace function public.display_name_blocked(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_name_terms t
    where case
      when t.match = 'contains' then
        public.normalize_handle(name) like '%' || public.normalize_handle(t.term) || '%'
        or (
          length(public.normalize_handle_loose(t.term)) >= 4
          and public.normalize_handle_loose(name) like '%' || public.normalize_handle_loose(t.term) || '%'
        )
      when t.match = 'word' then
        exists (
          select 1 from (select name union all select regexp_split_to_table(name, '_+')) part (p)
          where public.normalize_handle(part.p) = public.normalize_handle(t.term)
             or (
               length(public.normalize_handle_loose(t.term)) >= 4
               and public.normalize_handle_loose(part.p) = public.normalize_handle_loose(t.term)
             )
        )
      when t.match = 'group' then
        public.normalize_handle(name) = public.normalize_handle(t.term)
        or exists (
          select 1 from regexp_split_to_table(name, '_+') part
          where public.normalize_handle(part) = public.normalize_handle(t.term)
        )
      when t.match = 'name' then
        regexp_replace(lower(name), '[^a-z]', '', 'g') = t.term
      else false
    end
  )
  or (
    exists (
      select 1 from public.blocked_name_terms t
      where t.match = 'group'
        and public.normalize_handle(name) like '%' || public.normalize_handle(t.term) || '%'
    )
    and exists (
      select 1 from public.blocked_name_terms t
      where t.match = 'hostile'
        and public.normalize_handle(name) like '%' || public.normalize_handle(t.term) || '%'
    )
  );
$$;

revoke execute on function public.display_name_blocked(text) from public, anon, authenticated;
