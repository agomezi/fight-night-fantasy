-- Blocked display names: roots with allowed words.
--
-- A slur's short root hides inside ordinary words, so it could only be a
-- `word` term (the whole name or one underscore-separated part), and every
-- new spelling built on it ("-y", "-ie", "-ah" endings) had to be listed one
-- by one. Two new modes close that:
--
--   root   blocked anywhere in a name, like `contains`, except inside an
--          `allow` word.
--   allow  an ordinary word that has a root inside it. Never blocked and
--          never blocks; it's blanked out of the name before roots are
--          matched, so the root inside it doesn't count.
--
-- An allowed word is replaced with a separator, not removed, so the letters
-- either side of it can't join up into a root. A root that runs across an
-- underscore only counts when it starts at the beginning of a part: with a
-- root "zud", "zu_ddy" is blocked, but a first name ending in the root's
-- first letters followed by a surname starting with the rest ("Kazu_Dean")
-- isn't. Written with no
-- underscore, such a name is one part and is blocked. Everything else is
-- matched as before; `contains` terms ignore allowed words.
--
-- That makes a root weaker than `contains` across underscores: letters put in
-- front of a root before an underscore ("azu_ddy") hide it. A term with no
-- innocent use stays a `contains` term; `root` is for one that also sits
-- inside ordinary words.
--
-- Nothing is cleared by this migration, and with no root terms loaded nothing
-- changes. Names the new terms catch stay until the owner reloads the list
-- (scripts/load-blocked-names.mjs, whose --dry-run lists them first); a
-- player renaming is held to it straight away.

alter table public.blocked_name_terms
  drop constraint blocked_name_terms_match_check,
  add constraint blocked_name_terms_match_check
    check (match in ('contains', 'word', 'name', 'group', 'hostile', 'root', 'allow'));

-- Whether a name has a listed root in it: inside any one underscore-separated
-- part, or at the very start of a part and running on into the next ones.
-- Matched after the usual disguises are undone, with allowed words blanked
-- out, and with lookalike letters folded for roots that keep at least 4
-- letters. The allowed words are read and each piece of the name is blanked
-- once, then checked against every root.
create function public.name_has_blocked_root(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with roots as (
    select public.normalize_handle(t.term) as strict,
           case when length(public.normalize_handle_loose(t.term)) >= 4
                then public.normalize_handle_loose(t.term) end as loose
    from public.blocked_name_terms t
    where t.match = 'root'
  ),
  -- Longer words first, so a longer allowed word wins over one inside it.
  allowed as (
    select
      (select string_agg(w, '|' order by length(w) desc, w)
       from (select distinct public.normalize_handle(t.term) as w
             from public.blocked_name_terms t where t.match = 'allow') a
       where w <> '') as strict,
      (select string_agg(w, '|' order by length(w) desc, w)
       from (select distinct public.normalize_handle_loose(t.term) as w
             from public.blocked_name_terms t where t.match = 'allow') a
       where w <> '') as loose
  ),
  parts as (
    select u.p, u.i
    from unnest(regexp_split_to_array(name, '_+')) with ordinality u (p, i)
    where u.p <> '' and exists (select 1 from roots)
  ),
  pieces (piece, from_start) as (
    select p, false from parts
    union all
    select (select string_agg(q.p, '' order by q.i) from parts q where q.i >= s.i), true
    from parts s
  ),
  -- An allowed word becomes "|", not nothing, so the letters either side of
  -- it can't join up into a root.
  blanked as (
    select pieces.from_start,
           coalesce(regexp_replace(public.normalize_handle(pieces.piece), a.strict, '|', 'g'),
                    public.normalize_handle(pieces.piece)) as strict,
           coalesce(regexp_replace(public.normalize_handle_loose(pieces.piece), a.loose, '|', 'g'),
                    public.normalize_handle_loose(pieces.piece)) as loose
    from pieces, allowed a
  )
  select exists (
    select 1 from blanked b, roots r
    where b.strict like case when b.from_start then '' else '%' end || r.strict || '%'
       or (r.loose is not null and b.loose like case when b.from_start then '' else '%' end || r.loose || '%')
  );
$$;

revoke execute on function public.name_has_blocked_root(text) from public, anon, authenticated;

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
  or public.name_has_blocked_root(name)
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
