-- Keeping reports from being used against a player.
--
--   A daily limit: a player can file five reports a day, from anywhere.
--   Established reporters: an account at least a week old with picks on a
--     scored card. Anything that later acts on reports by itself counts only
--     these; every report is still recorded and emailed.
--   Pile-ons: three reports against a player within an hour, or most of their
--     reporters being new accounts, mark the email BURST.
--   One email per player per hour: the first report emails at once, and any
--     more against the same player within the hour wait and go out together.
--   Protected players: moderators can never be hidden automatically. Reports
--     against them are still emailed.

-------------------------------------------------------------------------------
-- Moderators
-------------------------------------------------------------------------------

-- Set by hand in the SQL editor. Players can't change it: profile updates are
-- granted column by column.
alter table public.profiles add column is_moderator boolean not null default false;

-------------------------------------------------------------------------------
-- Reporters
-------------------------------------------------------------------------------

create function public.reporter_established(player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = player and p.created_at <= now() - interval '7 days')
     and exists (select 1 from public.scores s where s.user_id = player);
$$;

revoke execute on function public.reporter_established(uuid) from public, anon, authenticated;

-- Refuses a sixth report within a day. Taken under a lock per reporter, so
-- reports sent at once can't slip past it together.
create function public.check_report_limit(reporter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('name_reports:' || reporter, 0));
  if (select count(*) from public.name_reports r
      where r.reporter_id = reporter and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow.'
      using errcode = 'P0001', hint = 'report_limit';
  end if;
end;
$$;

revoke execute on function public.check_report_limit(uuid) from public, anon, authenticated;

-- As before, under the daily limit.
create or replace function public.report_display_name(reported uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me   uuid := (select auth.uid());
  name text;
begin
  if me is null then
    raise exception 'Sign in to report a name.' using errcode = 'P0001';
  end if;
  if reported = me then
    raise exception 'You can''t report yourself.' using errcode = 'P0001';
  end if;
  select display_name into name from public.profiles where id = reported and deleted_at is null;
  if name is null then
    return; -- No name to report, or the account is gone.
  end if;
  if exists (select 1 from public.name_reports r where r.reporter_id = me and r.reported_id = reported) then
    return; -- Already reported, which doesn't count against the limit.
  end if;
  perform public.check_report_limit(me);
  insert into public.name_reports (reporter_id, reported_id, display_name, reason)
  values (me, reported, name, left(reason, 200))
  on conflict (reporter_id, reported_id) do nothing;
end;
$$;

-- As before, under the daily limit.
create or replace function public.report_league_member(league uuid, member uuid, reason text, note text default null)
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

-------------------------------------------------------------------------------
-- One email per player per hour
-------------------------------------------------------------------------------

-- True when a report against this player was emailed within the hour, so new
-- ones wait to go out together.
create function public.report_email_held(player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.name_reports r
    where r.reported_id = player and r.emailed_at > now() - interval '1 hour'
  );
$$;

revoke execute on function public.report_email_held(uuid) from public, anon, authenticated;

-- As before, unless the email is being held: the five-minute job sends it
-- once the hour is up.
create or replace function public.report_filed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.report_email_held(new.reported_id) then
    perform public.invoke_activity_push();
  end if;
  return null;
end;
$$;

-- As before, counting only reports that can go out now.
create or replace function public.invoke_pending_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notifications_sent where not pushed)
     or exists (
       select 1 from public.name_reports r
       where r.emailed_at is null and not public.report_email_held(r.reported_id)
     ) then
    perform public.invoke_activity_push();
  end if;
end;
$$;

-- Now one row per reported player, with every new report against them and
-- what's needed to judge whether they're being piled on.
--
--   reporters    distinct players who have ever reported them
--   established  how many of those are established
--   leagues      distinct leagues those reports came from
--   burst        three reports within the hour, or most reporters new
--   reports      the new reports, oldest first, each with its reporter's
--                account age, reports filed and standing
drop function public.claim_report_emails();

create function public.claim_report_emails()
returns table (
  reported_id  uuid,
  current_name text,
  past_names   text[],
  protected    boolean,
  reporters    integer,
  established  integer,
  leagues      integer,
  burst        boolean,
  reports      jsonb
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.name_reports r set emailed_at = now()
    where r.emailed_at is null and not public.report_email_held(r.reported_id)
    returning r.id, r.reported_id, r.display_name, r.reason, r.note, r.league_id, r.reporter_id, r.created_at
  ),
  targets as (
    select distinct c.reported_id from claimed c
  ),
  everyone as (
    select r.reported_id, r.reporter_id, r.league_id, r.created_at,
      public.reporter_established(r.reporter_id) as established
    from public.name_reports r
    where r.reported_id in (select t.reported_id from targets t)
  ),
  tally as (
    select e.reported_id,
      count(distinct e.reporter_id)::integer as reporters,
      (count(distinct e.reporter_id) filter (where e.established))::integer as established,
      count(distinct e.league_id)::integer as leagues,
      count(*) filter (where e.created_at > now() - interval '1 hour') as last_hour
    from everyone e
    group by e.reported_id
  )
  select t.reported_id, p.display_name,
    array(
      select h.display_name from public.display_name_history h
      where h.user_id = t.reported_id
      order by h.changed_at desc
    ),
    p.is_moderator,
    s.reporters, s.established, s.leagues,
    s.last_hour >= 3 or (s.reporters >= 2 and 2 * (s.reporters - s.established) > s.reporters),
    (
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'reportedName', c.display_name,
          'reason', c.reason,
          'note', c.note,
          'league', l.name,
          'reporterId', c.reporter_id,
          'reporterName', rp.display_name,
          'reporterAgeDays', floor(extract(epoch from now() - rp.created_at) / 86400)::integer,
          'reporterReports', (select count(*) from public.name_reports x where x.reporter_id = c.reporter_id),
          'reporterEstablished', public.reporter_established(c.reporter_id),
          'reportedAt', c.created_at
        ) order by c.created_at, c.id)
      from claimed c
      join public.profiles rp on rp.id = c.reporter_id
      left join public.leagues l on l.id = c.league_id
      where c.reported_id = t.reported_id
    )
  from targets t
  join public.profiles p on p.id = t.reported_id
  join tally s on s.reported_id = t.reported_id
  order by t.reported_id;
$$;

revoke execute on function public.claim_report_emails() from public, anon, authenticated;
grant execute on function public.claim_report_emails() to service_role;
