-- Blocked display names: hateful pairs.
--
-- A short identity term has to sit in `word` mode, since it hides inside
-- ordinary words, so a name that glues one onto a violent word got through
-- (neither half is blocked alone). Two new modes close that:
--
--   group    an identity term. Blocked on its own like `word` (the whole
--            name, or one underscore-separated part), and anywhere in a name
--            that also has a `hostile` term.
--   hostile  a word that is only hateful next to an identity term (kill,
--            hunt, ...). Never blocked on its own.
--
-- The pair is matched after the usual disguises are undone. The terms stay in
-- the private list, loaded by scripts/load-blocked-names.mjs, which also
-- clears names the new list blocks (--dry-run lists them first). League names
-- go through the same check.

alter table public.blocked_name_terms
  drop constraint blocked_name_terms_match_check,
  add constraint blocked_name_terms_match_check
    check (match in ('contains', 'word', 'name', 'group', 'hostile'));

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
      when t.match in ('word', 'group') then
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

-- What a new list would catch, without keeping it: the players whose names it
-- would clear and the leagues whose names it would refuse (nothing renames a
-- league, so those are fixed by hand). The list is swapped inside a
-- savepoint that is always rolled back. The loader's --dry-run calls this.
create function public.preview_blocked_names(terms jsonb)
returns table (kind text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  hits jsonb := '[]';
begin
  begin
    delete from public.blocked_name_terms;
    insert into public.blocked_name_terms (term, match)
    select t->>'term', t->>'match' from jsonb_array_elements(terms) t;
    select coalesce(jsonb_agg(jsonb_build_array(h.kind, h.name) order by h.kind, h.name), '[]') into hits
    from (
      select 'player' as kind, p.display_name as name
      from public.profiles p
      where p.display_name is not null and public.display_name_blocked(p.display_name)
      union all
      select 'league', l.name
      from public.leagues l
      where public.display_name_blocked(replace(l.name, ' ', '_'))
    ) h;
    raise exception 'preview only' using errcode = 'FNFPV';
  exception when sqlstate 'FNFPV' then
    null;
  end;
  return query select h->>0, h->>1 from jsonb_array_elements(hits) h;
end;
$$;

revoke execute on function public.preview_blocked_names(jsonb) from public, anon, authenticated;
