-- Phase 1: the core loop — events, bouts, results, picks, scores, leagues.
--
-- Access model: nothing is readable unless a grant and an RLS policy both
-- allow it. Reference data and results are written only by ingestion (the
-- service role, which bypasses RLS); users write only their own picks.

-------------------------------------------------------------------------------
-- Types
-------------------------------------------------------------------------------

create type public.event_status as enum ('scheduled', 'live', 'complete', 'cancelled');
create type public.card_segment as enum ('main', 'prelims', 'early_prelims');
create type public.corner as enum ('red', 'blue');
create type public.bout_status as enum ('scheduled', 'cancelled');

-- DEC is a method for scoring purposes; a pick names KO or SUB, or picks DEC
-- through `finish`.
create type public.result_method as enum ('KO', 'SUB', 'DEC');
create type public.pick_method as enum ('KO', 'SUB');
create type public.void_reason as enum ('NC', 'DRAW', 'CANCELLED', 'FIGHTER_CHANGED');

-- The live feed publishes a result before it is settled and sometimes
-- corrects it minutes later, so a result is provisional until marked final.
create type public.result_status as enum ('provisional', 'final');
create type public.result_source as enum ('ufc_live', 'ufc_html', 'manual');

create type public.finish_kind as enum ('round', 'DEC', 'ANY');
create type public.league_tier as enum ('casual', 'amateur', 'pro', 'hardcore');
create type public.membership_status as enum ('active', 'queued');

-------------------------------------------------------------------------------
-- Shared trigger: updated_at
-------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Seasons and events
-------------------------------------------------------------------------------

-- Seasons are global and eleven events long, so every league shares one clock.
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  number     integer not null unique check (number > 0),
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  starts_at    timestamptz not null,
  -- Picks lock for the whole card at once, when the first bout begins.
  locks_at     timestamptz not null,
  status       public.event_status not null default 'scheduled',
  season_id    uuid references public.seasons (id),
  season_index smallint check (season_index between 1 and 11),
  ufc_event_id text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (locks_at <= starts_at),
  check ((season_id is null) = (season_index is null)),
  unique (season_id, season_index)
);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Fighters and bouts
-------------------------------------------------------------------------------

-- One row per fighter, carrying the id each source uses for them.
create table public.fighters (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  nickname             text,
  photo_url            text,
  ufc_fighter_id       text unique,
  apisports_fighter_id integer unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger fighters_updated_at before update on public.fighters
  for each row execute function public.set_updated_at();

create table public.bouts (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  fight_order      smallint not null check (fight_order > 0),
  card_segment     public.card_segment not null,
  weight_class     text,
  scheduled_rounds smallint not null default 3 check (scheduled_rounds in (3, 5)),
  red_fighter_id   uuid not null references public.fighters (id),
  blue_fighter_id  uuid not null references public.fighters (id),
  -- Bumped whenever a fighter is replaced. A pick records the version it was
  -- made against, so a substitution is detectable and voids that pick.
  version          integer not null default 1 check (version > 0),
  -- Snapshotted once when the event starts, so every pick on the bout gets the
  -- same multiplier and scoring stays reproducible after odds move.
  underdog_corner  public.corner,
  status           public.bout_status not null default 'scheduled',
  ufc_fight_id     text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (red_fighter_id <> blue_fighter_id),
  -- Deferrable so a late reorder can swap two bouts' positions in one transaction.
  unique (event_id, fight_order) deferrable initially deferred
);

create index bouts_event_id_idx on public.bouts (event_id);

create function public.bump_bout_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.red_fighter_id is distinct from old.red_fighter_id
     or new.blue_fighter_id is distinct from old.blue_fighter_id then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger bouts_bump_version before update on public.bouts
  for each row execute function public.bump_bout_version();

create trigger bouts_updated_at before update on public.bouts
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Results
-------------------------------------------------------------------------------

-- The current answer for a bout. No row means the bout is still pending.
create table public.results (
  bout_id           uuid primary key references public.bouts (id) on delete cascade,
  status            public.result_status not null default 'provisional',
  winner_fighter_id uuid references public.fighters (id),
  method            public.result_method,
  round             smallint check (round between 1 and 5),
  time              text check (time ~ '^[0-5]?[0-9]:[0-5][0-9]$'),
  void_reason       public.void_reason,
  source            public.result_source not null,
  -- Once a human sets a result, the feed no longer overwrites it.
  manual_override   boolean not null default false,
  -- The payload as received, so a result can be re-derived without re-fetching.
  raw               jsonb,
  updated_at        timestamptz not null default now(),
  -- Either a scored result or a void one, never a mix.
  check (
    (void_reason is null and winner_fighter_id is not null and method is not null)
    or (void_reason is not null and winner_fighter_id is null and method is null and round is null)
  ),
  -- A decision ends when the scheduled rounds run out, so it names no round;
  -- a finish always does.
  check (method is distinct from 'DEC' or round is null),
  check (method is null or method = 'DEC' or round is not null)
);

create function public.guard_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  b public.bouts%rowtype;
begin
  -- Manual corrections are sticky: a non-manual write to a manually set
  -- result is skipped rather than silently reverting a human decision.
  if tg_op = 'UPDATE' and old.manual_override and new.source <> 'manual' then
    return null;
  end if;

  if new.winner_fighter_id is not null then
    select * into b from public.bouts where id = new.bout_id;
    if new.winner_fighter_id not in (b.red_fighter_id, b.blue_fighter_id) then
      raise exception 'winner % is not in bout %', new.winner_fighter_id, new.bout_id;
    end if;
    if new.round is not null and new.round > b.scheduled_rounds then
      raise exception 'round % exceeds the % scheduled for bout %',
        new.round, b.scheduled_rounds, new.bout_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger results_guard before insert or update on public.results
  for each row execute function public.guard_result();

-- Every version a result has been through, append-only. A provisional result
-- that gets corrected leaves both versions here.
create table public.result_revisions (
  id                bigint generated always as identity primary key,
  bout_id           uuid not null references public.bouts (id) on delete cascade,
  recorded_at       timestamptz not null default now(),
  status            public.result_status not null,
  winner_fighter_id uuid,
  method            public.result_method,
  round             smallint,
  time              text,
  void_reason       public.void_reason,
  source            public.result_source not null,
  manual_override   boolean not null,
  raw               jsonb
);

create index result_revisions_bout_id_idx on public.result_revisions (bout_id, recorded_at);

create function public.record_result_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.result_revisions
    (bout_id, status, winner_fighter_id, method, round, time,
     void_reason, source, manual_override, raw)
  values
    (new.bout_id, new.status, new.winner_fighter_id, new.method, new.round, new.time,
     new.void_reason, new.source, new.manual_override, new.raw);
  return null;
end;
$$;

create trigger results_record_revision after insert or update on public.results
  for each row execute function public.record_result_revision();

-------------------------------------------------------------------------------
-- Profiles
-------------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Picks and scores
-------------------------------------------------------------------------------

-- References to profiles below use `on delete restrict`: what deleting an
-- account does to league history is not yet decided, so deletion is blocked
-- until it is rather than silently rewriting other members' standings.

create table public.picks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  bout_id           uuid not null references public.bouts (id) on delete cascade,
  bout_version      integer not null,
  -- The fighter, not the corner: corners stay put when a fighter is replaced.
  picked_fighter_id uuid not null references public.fighters (id),
  finish            public.finish_kind not null,
  finish_round      smallint check (finish_round between 1 and 5),
  method            public.pick_method,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, bout_id),
  check ((finish = 'round') = (finish_round is not null)),
  -- The method toggle is suppressed on a decision pick.
  check (finish <> 'DEC' or method is null)
);

create index picks_bout_id_idx on public.picks (bout_id);

create function public.validate_pick()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  b public.bouts%rowtype;
begin
  select * into b from public.bouts where id = new.bout_id;

  if new.picked_fighter_id not in (b.red_fighter_id, b.blue_fighter_id) then
    raise exception 'fighter % is not in bout %', new.picked_fighter_id, new.bout_id;
  end if;
  if new.bout_version <> b.version then
    raise exception 'pick is against bout version %, current is %', new.bout_version, b.version;
  end if;
  if new.finish_round > b.scheduled_rounds then
    raise exception 'round % exceeds the % scheduled for bout %',
      new.finish_round, b.scheduled_rounds, new.bout_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger picks_validate before insert or update on public.picks
  for each row execute function public.validate_pick();

-- Derived from picks and results and fully recomputable: a corrected result
-- re-runs scoring rather than patching points.
create table public.scores (
  user_id             uuid not null references public.profiles (id) on delete restrict,
  bout_id             uuid not null references public.bouts (id) on delete cascade,
  season_id           uuid references public.seasons (id),
  points              integer not null,
  breakdown           jsonb not null,
  correct             boolean not null,
  counts_for_accuracy boolean not null,
  computed_at         timestamptz not null default now(),
  primary key (user_id, bout_id)
);

create index scores_season_user_idx on public.scores (season_id, user_id);

-------------------------------------------------------------------------------
-- Leagues
-------------------------------------------------------------------------------

create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  tier        public.league_tier not null default 'casual',
  invite_code text not null unique
                default substring(replace(gen_random_uuid()::text, '-', '') for 8),
  created_at  timestamptz not null default now()
);

-- Membership locks at the season boundary. Someone joining mid-season is
-- `queued` and joins the rotation from `active_from_season_id`.
create table public.league_members (
  league_id             uuid not null references public.leagues (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete restrict,
  status                public.membership_status not null default 'queued',
  active_from_season_id uuid references public.seasons (id),
  joined_at             timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_members_user_id_idx on public.league_members (user_id);

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

alter table public.seasons          enable row level security;
alter table public.events           enable row level security;
alter table public.fighters         enable row level security;
alter table public.bouts            enable row level security;
alter table public.results          enable row level security;
alter table public.result_revisions enable row level security;
alter table public.profiles         enable row level security;
alter table public.picks            enable row level security;
alter table public.scores           enable row level security;
alter table public.leagues          enable row level security;
alter table public.league_members   enable row level security;

-- Start from nothing and grant only what each role needs, so behaviour does
-- not depend on whether the project exposes new tables by default.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.seasons, public.events, public.fighters, public.bouts, public.results
  to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.picks to authenticated;
grant select on public.scores to authenticated;
grant select on public.leagues, public.league_members to authenticated;
-- result_revisions is internal and granted to no client role.

create policy "reference data is public" on public.seasons
  for select to anon, authenticated using (true);
create policy "reference data is public" on public.events
  for select to anon, authenticated using (true);
create policy "reference data is public" on public.fighters
  for select to anon, authenticated using (true);
create policy "reference data is public" on public.bouts
  for select to anon, authenticated using (true);
create policy "reference data is public" on public.results
  for select to anon, authenticated using (true);

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own picks" on public.picks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own scores" on public.scores
  for select to authenticated using (user_id = (select auth.uid()));

create policy "read own memberships" on public.league_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read leagues you belong to" on public.leagues
  for select to authenticated using (
    exists (
      select 1 from public.league_members m
      where m.league_id = leagues.id and m.user_id = (select auth.uid())
    )
  );
