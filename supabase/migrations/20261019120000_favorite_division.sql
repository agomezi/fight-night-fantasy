-- A favorite division players choose for themselves.
--
-- Edit Profile has always offered one, but kept it on the phone, so a league
-- mate's profile could only guess from their picks. It now lives on the
-- profile, and the league profile shows it, falling back to the most-picked
-- division for anyone who hasn't chosen.

alter table public.profiles
  add column fav_division text check (fav_division in (
    'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight',
    'Middleweight', 'Light Heavyweight', 'Heavyweight',
    'Women''s Strawweight', 'Women''s Flyweight', 'Women''s Bantamweight', 'Women''s Featherweight'
  ));

grant update (fav_division) on public.profiles to authenticated;

-- A deleted account keeps nothing it chose.
create function public.clear_fav_division_on_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.fav_division := null;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_fav_division before update of deleted_at on public.profiles
  for each row execute function public.clear_fav_division_on_delete();

-- As before, with the chosen division first.
create or replace function public.league_member_profile(league uuid, member uuid)
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
         )
  from p, acc
  where public.shares_league(league, member);
$$;

