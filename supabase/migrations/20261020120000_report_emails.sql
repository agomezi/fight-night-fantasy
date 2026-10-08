-- An email to the owner for every new report.
--
-- A report asks the sync-results Edge Function to send what is pending, the
-- same way a league join does, and the five-minute activity job catches
-- anything that call missed. The sender claims the reports not yet emailed,
-- emails each one through Resend, and hands back any it couldn't send so the
-- next run tries again.
--
-- Reports from before this migration are already in reported_names and are
-- not emailed.

alter table public.name_reports add column emailed_at timestamptz;

update public.name_reports set emailed_at = created_at;

create index name_reports_unemailed_idx on public.name_reports (created_at) where emailed_at is null;

-------------------------------------------------------------------------------
-- Asking for the email
-------------------------------------------------------------------------------

create function public.report_filed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.invoke_activity_push();
  return null;
end;
$$;

revoke execute on function public.report_filed() from public, anon, authenticated;

create trigger name_reports_email after insert on public.name_reports
  for each row execute function public.report_filed();

-- As before, and also when a report is waiting to be emailed.
create or replace function public.invoke_pending_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notifications_sent where not pushed)
     or exists (select 1 from public.name_reports where emailed_at is null) then
    perform public.invoke_activity_push();
  end if;
end;
$$;

-------------------------------------------------------------------------------
-- Sending
-------------------------------------------------------------------------------

-- Reports not yet emailed, claimed in the statement that finds them, with
-- everything the email needs. `reporters` counts every distinct player who
-- has reported this player, this report included.
create function public.claim_report_emails()
returns table (
  report_id     bigint,
  reported_id   uuid,
  reported_name text,
  current_name  text,
  past_names    text[],
  reason        text,
  note          text,
  league        text,
  reporter_id   uuid,
  reporter_name text,
  reported_at   timestamptz,
  reporters     integer
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.name_reports r set emailed_at = now()
    where r.emailed_at is null
    returning r.id, r.reported_id, r.display_name, r.reason, r.note, r.league_id, r.reporter_id, r.created_at
  )
  select c.id, c.reported_id, c.display_name, p.display_name,
    array(
      select h.display_name from public.display_name_history h
      where h.user_id = c.reported_id
      order by h.changed_at desc
    ),
    c.reason, c.note, l.name, c.reporter_id, rp.display_name, c.created_at,
    (select count(distinct x.reporter_id)::integer from public.name_reports x where x.reported_id = c.reported_id)
  from claimed c
  join public.profiles p on p.id = c.reported_id
  join public.profiles rp on rp.id = c.reporter_id
  left join public.leagues l on l.id = c.league_id
  order by c.created_at, c.id;
$$;

-- Puts back reports the sender claimed but couldn't email.
create function public.release_report_emails(report_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.name_reports set emailed_at = null where id = any (report_ids);
$$;

revoke execute on function public.claim_report_emails(), public.release_report_emails(bigint[])
  from public, anon, authenticated;
grant execute on function public.claim_report_emails(), public.release_report_emails(bigint[])
  to service_role;
