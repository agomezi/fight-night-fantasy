-- Profile titles: a player wears one award they've won (a season badge) as a
-- title next to their pro record, and anyone who opens their card sees it.
--
-- The title is an award id. It shows only while a badge for that award still
-- exists, so deleting a final drop (or the Season 1 wipe) takes it away too.

alter table public.profiles add column title_award text;

-- Wear an award you've won as your title; null takes it off.
create function public.set_profile_title(award text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if award is not null and not exists (
    select 1 from public.award_badges b where b.user_id = me and b.award = set_profile_title.award
  ) then
    raise exception 'You haven''t won that award' using errcode = '22023';
  end if;
  update public.profiles p set title_award = set_profile_title.award where p.id = me;
end;
$$;

revoke execute on function public.set_profile_title(text) from public, anon;
grant execute on function public.set_profile_title(text) to authenticated;

-- The title a player wears, with the same hiding as player_badges: nothing
-- for a player you've blocked, or one deleted or banned.
create function public.player_title(member uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.title_award
  from public.profiles p
  where p.id = member
    and (select auth.uid()) is not null
    and p.deleted_at is null
    and not public.blocked_by_me(member)
    and (select ps.standing from public.player_standing(member) ps) is distinct from 'banned'
    and exists (select 1 from public.award_badges b where b.user_id = member and b.award = p.title_award);
$$;

revoke execute on function public.player_title(uuid) from public, anon;
grant execute on function public.player_title(uuid) to authenticated;
