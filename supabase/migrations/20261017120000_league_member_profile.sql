-- League member profiles and reporting a member.
--
-- Tapping a name in a league opens a small profile: the name, accuracy this
-- season and favorite division. It runs as its owner, so it checks the caller
-- shares the league and returns only those fields: no email, no picks.
--
-- Reports go into the existing name_reports table, now with the league they
-- came from, a reason and an optional note, so every report is reviewed in one
-- place (the reported_names view). One report per player per name still
-- holds, so repeating one adds nothing.

-------------------------------------------------------------------------------
-- Reports
-------------------------------------------------------------------------------

alter table public.name_reports
  add column league_id uuid references public.leagues (id) on delete set null,
  add column note      text check (char_length(note) <= 500);

-- True when both players are in the league, including anyone still in this
-- season's rotation after leaving.
create function public.shares_league(league uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_league_member(league)
     and exists (select 1 from public.league_members m where m.league_id = league and m.user_id = member);
$$;

revoke execute on function public.shares_league(uuid, uuid) from public, anon, authenticated;

-- Reports a league member's name. Returns false when there was nothing new to
-- record: this name was already reported by you, or the account is gone.
create function public.report_league_member(league uuid, member uuid, reason text, note text default null)
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
  if not public.shares_league(league, member) then
    raise exception 'You can only report players in your leagues.' using errcode = 'P0001';
  end if;

  select display_name into name from public.profiles where id = member and deleted_at is null;
  if name is null then
    return false;
  end if;

  insert into public.name_reports (reporter_id, reported_id, display_name, reason, league_id, note)
  values (me, member, name, reason, league, nullif(left(btrim(note), 500), ''))
  on conflict (reporter_id, reported_id, display_name) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;

revoke execute on function public.report_league_member(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_league_member(uuid, uuid, text, text) to authenticated;

-- As before, with the reasons, notes and leagues behind the reports.
create or replace view public.reported_names with (security_invoker = true) as
select r.reported_id as player,
       p.display_name as current_name,
       count(*) as reports,
       count(distinct r.reporter_id) as reporters,
       array_agg(distinct r.display_name) as reported_names,
       max(r.created_at) as last_reported,
       array_agg(distinct r.reason) filter (where r.reason is not null) as reasons,
       array_agg(r.note order by r.created_at desc) filter (where r.note is not null) as notes,
       array_agg(distinct l.name) filter (where l.name is not null) as leagues
from public.name_reports r
join public.profiles p on p.id = r.reported_id
left join public.leagues l on l.id = r.league_id
group by r.reported_id, p.display_name
order by count(distinct r.reporter_id) desc, max(r.created_at) desc;

revoke all on public.reported_names from anon, authenticated;

-------------------------------------------------------------------------------
-- Profile
-------------------------------------------------------------------------------

-- Accuracy is this season's, as on the leaderboard. The favorite division is
-- the weight class picked most across scored bouts, so nothing about a card
-- still open is given away, and only once there are at least five of them;
-- a tie goes to the one picked most recently.
create function public.league_member_profile(league uuid, member uuid)
returns table (
  display_name     text,
  accuracy         integer,
  favorite_division text,
  is_me            boolean,
  can_report       boolean,
  reported         boolean
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
    select pr.display_name, pr.deleted_at from public.profiles pr where pr.id = member
  )
  select public.league_display_name(member),
         case when acc.counted = 0 then null else round(100.0 * acc.correct / acc.counted)::integer end,
         case when (select sum(picks) from divisions) >= 5
              then (select d.weight_class from divisions d order by d.picks desc, d.latest desc, d.weight_class limit 1)
         end,
         member = (select auth.uid()),
         member <> (select auth.uid()) and p.deleted_at is null and p.display_name is not null,
         exists (
           select 1 from public.name_reports r
           where r.reporter_id = (select auth.uid()) and r.reported_id = member and r.display_name = p.display_name
         )
  from p, acc
  where public.shares_league(league, member);
$$;

revoke execute on function public.league_member_profile(uuid, uuid) from public, anon;
grant execute on function public.league_member_profile(uuid, uuid) to authenticated;
