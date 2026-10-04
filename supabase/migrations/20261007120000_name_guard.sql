-- Guarding display names against bad intent.
--
-- The blocked-terms list catches the obvious. This adds what catches the rest:
--
--   * A player can change their name once every 7 days, so nobody can cycle
--     through offensive names faster than they can be dealt with. Setting a
--     name for the first time (onboarding, or after a reset) is always free.
--   * Every name a player has held is kept, so a reset name can be traced.
--   * Players can report another player's name. Nothing in the app shows
--     other players yet; the report button arrives with leaderboards and
--     leagues, and this is what it will call.
--   * The owner can reset a name from the SQL editor, which sends that player
--     back through onboarding to pick a new one.

alter table public.profiles add column name_changed_at timestamptz;

-------------------------------------------------------------------------------
-- History
-------------------------------------------------------------------------------

create table public.display_name_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  changed_at   timestamptz not null default now()
);

create index display_name_history_user_idx on public.display_name_history (user_id, changed_at);

-- Internal: written by the trigger, read by the owner.
alter table public.display_name_history enable row level security;
revoke all on public.display_name_history from anon, authenticated;

-------------------------------------------------------------------------------
-- The weekly limit
-------------------------------------------------------------------------------

create function public.track_display_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is not distinct from old.display_name then
    return new;
  end if;

  -- A deleted account's personal data goes immediately, its past names and
  -- any reports naming it included.
  if new.deleted_at is not null then
    delete from public.display_name_history where user_id = old.id;
    delete from public.name_reports where reported_id = old.id;
    return new;
  end if;

  -- Players are held to the limit; a reset run by the owner is not. Taking a
  -- name for the first time, or again after a reset, is always allowed. This
  -- function runs as its owner, so the caller's role is read from the
  -- session rather than current_user.
  if current_setting('role', true) in ('anon', 'authenticated')
     and old.display_name is not null
     and old.name_changed_at > now() - interval '7 days' then
    raise exception 'You can change your name once a week.'
      using errcode = 'P0001', hint = 'too_soon',
            detail = to_char(old.name_changed_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if old.display_name is not null then
    insert into public.display_name_history (user_id, display_name) values (old.id, old.display_name);
  end if;
  if new.display_name is not null then
    new.name_changed_at := now();
  end if;
  return new;
end;
$$;

-- Runs after the blocked-name check (triggers fire in name order), so a
-- refused name never starts the clock.
create trigger profiles_track_display_name before update of display_name on public.profiles
  for each row execute function public.track_display_name();

-------------------------------------------------------------------------------
-- Reports
-------------------------------------------------------------------------------

create table public.name_reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reported_id  uuid not null references public.profiles (id) on delete cascade,
  -- The name as it was when reported, in case it has changed since.
  display_name text not null,
  reason       text check (char_length(reason) <= 200),
  created_at   timestamptz not null default now(),
  -- One report per player per name, so repeating it adds nothing.
  unique (reporter_id, reported_id, display_name)
);

alter table public.name_reports enable row level security;
revoke all on public.name_reports from anon, authenticated;

create function public.report_display_name(reported uuid, reason text default null)
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
  insert into public.name_reports (reporter_id, reported_id, display_name, reason)
  values (me, reported, name, left(reason, 200))
  on conflict (reporter_id, reported_id, display_name) do nothing;
end;
$$;

revoke execute on function public.report_display_name(uuid, text) from public, anon;
grant execute on function public.report_display_name(uuid, text) to authenticated;

-------------------------------------------------------------------------------
-- Owner tools, for the SQL editor
-------------------------------------------------------------------------------

-- Clears a player's name. They keep their picks and scores, and pick a new
-- name in onboarding the next time they open the app. The old name stays in
-- the history.
create function public.reset_display_name(player uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set display_name = null where id = player;
$$;

revoke execute on function public.reset_display_name(uuid) from public, anon, authenticated;

-- Names with reports against them, most reported first.
create view public.reported_names with (security_invoker = true) as
select r.reported_id as player,
       p.display_name as current_name,
       count(*) as reports,
       count(distinct r.reporter_id) as reporters,
       array_agg(distinct r.display_name) as reported_names,
       max(r.created_at) as last_reported
from public.name_reports r
join public.profiles p on p.id = r.reported_id
group by r.reported_id, p.display_name
order by count(distinct r.reporter_id) desc, max(r.created_at) desc;

revoke all on public.reported_names from anon, authenticated;
