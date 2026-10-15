-- The player card from anywhere a player is listed.
--
-- Tapping a name in a league opens their card: accuracy this season,
-- favorite division, and the menu to report or block them. The global
-- leaderboard only offered to report the name. It now opens the same card,
-- for anyone on it, so the card and the report no longer need a shared
-- league. The league versions stay, and go through the same code.

-------------------------------------------------------------------------------
-- The card
-------------------------------------------------------------------------------

-- league_member_profile's card, without the shared league.
create function public.player_profile(member uuid)
returns table (
  display_name      text,
  accuracy          integer,
  favorite_division text,
  is_me             boolean,
  can_report        boolean,
  reported          boolean,
  blocked           boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with season as (
    select id from public.seasons where starts_at is not null order by number desc limit 1
  ),
  acc as (
    select count(*) filter (where s.correct and s.counts_for_accuracy) as correct,
           count(*) filter (where s.counts_for_accuracy) as counted
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where s.user_id = member
      and e.season_id is not distinct from (select id from season)
  ),
  divisions as (
    select b.weight_class, count(*) as picks, max(e.starts_at) as latest
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where s.user_id = member and b.weight_class is not null
    group by b.weight_class
  ),
  p as (
    select pr.display_name, pr.deleted_at, pr.fav_division from public.profiles pr where pr.id = member
  )
  select public.league_display_name(member),
         case when acc.counted = 0 then null else round(100.0 * acc.correct / acc.counted)::integer end,
         coalesce(
           p.fav_division,
           case when (select sum(picks) from divisions) >= 5
                then (select d.weight_class from divisions d order by d.picks desc, d.latest desc, d.weight_class limit 1)
           end
         ),
         member = (select auth.uid()),
         member <> (select auth.uid()) and p.deleted_at is null and p.display_name is not null,
         exists (
           select 1 from public.name_reports r
           where r.reporter_id = (select auth.uid()) and r.reported_id = member
         ),
         public.blocked_by_me(member)
  from p, acc
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;

-- As before: the same card, for a league mate only.
create or replace function public.league_member_profile(league uuid, member uuid)
returns table (
  display_name      text,
  accuracy          integer,
  favorite_division text,
  is_me             boolean,
  can_report        boolean,
  reported          boolean,
  blocked           boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.player_profile(member) where public.shares_league(league, member);
$$;

-------------------------------------------------------------------------------
-- Reporting
-------------------------------------------------------------------------------

-- Files a report on a player's name, under the daily limit. False when there
-- was nothing new to report: the account is gone, or you already reported
-- them. `league` is where it was filed from, if anywhere.
create function public.file_name_report(member uuid, reason text, note text, league uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := (select auth.uid());
  name  text;
  added integer;
begin
  if me is null then
    raise exception 'Sign in to report a player.' using errcode = 'P0001';
  end if;
  if member = me then
    raise exception 'You can''t report yourself.' using errcode = 'P0001';
  end if;
  if reason is null or reason not in ('offensive name', 'impersonation', 'other') then
    raise exception 'Pick a reason for the report.' using errcode = 'P0001';
  end if;

  select display_name into name from public.profiles where id = member and deleted_at is null;
  if name is null then
    return false;
  end if;
  if exists (select 1 from public.name_reports r where r.reporter_id = me and r.reported_id = member) then
    return false; -- Already reported, which doesn't count against the limit.
  end if;
  perform public.check_report_limit(me);

  insert into public.name_reports (reporter_id, reported_id, display_name, reason, league_id, note)
  values (me, member, name, reason, league, nullif(left(btrim(note), 500), ''))
  on conflict (reporter_id, reported_id) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;

revoke execute on function public.file_name_report(uuid, text, text, uuid) from public, anon, authenticated;

-- A report from the global leaderboard.
create function public.report_player(member uuid, reason text, note text default null)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.file_name_report(member, reason, note, null);
$$;

revoke execute on function public.report_player(uuid, text, text) from public, anon;
grant execute on function public.report_player(uuid, text, text) to authenticated;

-- As before: a report from a league, on a league mate only.
create or replace function public.report_league_member(league uuid, member uuid, reason text, note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to report a player.' using errcode = 'P0001';
  end if;
  if member = (select auth.uid()) then
    raise exception 'You can''t report yourself.' using errcode = 'P0001';
  end if;
  if reason is null or reason not in ('offensive name', 'impersonation', 'other') then
    raise exception 'Pick a reason for the report.' using errcode = 'P0001';
  end if;
  if not public.shares_league(league, member) then
    raise exception 'You can only report players in your leagues.' using errcode = 'P0001';
  end if;
  return public.file_name_report(member, reason, note, league);
end;
$$;
