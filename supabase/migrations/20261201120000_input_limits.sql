-- Input limits: nothing a player types can be guessed at or flooded.
--
-- Invite codes: about 10 wrong codes an hour per account, across join_league
-- and league_preview. Right codes don't count. Past the limit both refuse
-- every code, right or wrong, until the oldest wrong one is an hour old.
-- Starting leagues: 5 a day per account, so create-and-leave can't pile them
-- up. Push tokens: an account keeps its 10 newest phones.
--
-- Already capped: display names (40, one rename a week), league names (40),
-- report notes (500, 5 reports a day), time zones (64), push tokens (10 to
-- 200), poll votes (one of the poll's options, one vote per poll), pins
-- (max_pinned_calls), picks (one per fight). Name checks while typing are
-- left as they are here.

-------------------------------------------------------------------------------
-- Attempts
-------------------------------------------------------------------------------

-- One row per counted attempt. Only the functions below read or write it.
-- Each check clears the player's rows that have aged out, and the limits keep
-- it to a few rows per player, so it needs no cleanup job.
create table public.input_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('invite_code', 'create_league')),
  created_at timestamptz not null default now()
);

create index input_attempts_user_kind_idx on public.input_attempts (user_id, kind, created_at);

alter table public.input_attempts enable row level security;
revoke all on public.input_attempts from anon, authenticated;

-- How many attempts of each kind fit in how long, and what a player past
-- the limit is told.
create function public.input_limit(kind text)
returns table (max_tries integer, per interval, message text)
language sql
immutable
set search_path = ''
as $$
  select x.max_tries, x.per, x.message
  from (values ('invite_code', 10, interval '1 hour', 'Too many tries. Wait a bit and try again.'),
               ('create_league', 5, interval '1 day', 'You''ve started 5 leagues today. Try again tomorrow.'))
       x(kind, max_tries, per, message)
  where x.kind = input_limit.kind;
$$;

-- Refuses once the player has used up this kind's attempts. Taken under a
-- lock per player and kind, so parallel calls can't all slip in under it.
create function public.check_input_limit(player uuid, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim record;
begin
  select * into strict lim from public.input_limit(kind);
  perform pg_advisory_xact_lock(hashtextextended('input_attempts:' || kind || ':' || player, 0));
  delete from public.input_attempts a
  where a.user_id = player and a.kind = check_input_limit.kind and a.created_at <= now() - lim.per;
  if (select count(*) from public.input_attempts a
      where a.user_id = player and a.kind = check_input_limit.kind) >= lim.max_tries then
    raise exception '%', lim.message using errcode = 'P0001', hint = 'rate_limited';
  end if;
end;
$$;

create function public.record_input_attempt(player uuid, kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.input_attempts (user_id, kind) values (player, kind);
$$;

revoke execute on function public.input_limit(text), public.check_input_limit(uuid, text),
  public.record_input_attempt(uuid, text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Invite codes
-------------------------------------------------------------------------------

-- As before, and a wrong code counts against the caller.
--
-- A raised error rolls back the whole call, the attempt with it, so a wrong
-- code is answered without raising: the response is given status 400 and the
-- body PostgREST sends for a raised error, which the app reads the same way.
-- That is also why this returns jsonb: a league id comes back as the same
-- JSON string the uuid version sent.
drop function public.join_league(text);

create function public.join_league(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := public.require_named_player();
  league uuid;
  mine   public.league_members%rowtype;
  known  boolean;
begin
  perform public.check_input_limit(uid, 'invite_code');
  select id into league from public.leagues
  where invite_code = lower(btrim(coalesce(code, '')));
  if not found then
    perform public.record_input_attempt(uid, 'invite_code');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('code', 'P0001', 'message', 'No league has that code.', 'details', null, 'hint', 'not_found');
  end if;

  select * into mine from public.league_members where league_id = league and user_id = uid;
  known := found;
  if known and mine.left_at is null then
    return to_jsonb(league);
  end if;

  perform public.check_league_capacity(uid);
  if (select count(*) from public.league_members where league_id = league and left_at is null)
     >= (select max_members from public.league_limits()) then
    raise exception 'That league is full.' using errcode = 'P0001', hint = 'full';
  end if;

  if known then
    update public.league_members set left_at = null where league_id = league and user_id = uid;
  else
    insert into public.league_members (league_id, user_id) values (league, uid);
  end if;
  perform public.queue_league_join(league, uid);
  return to_jsonb(league);
end;
$$;

revoke execute on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

-- As before, and a wrong code counts against the caller. No longer stable:
-- it writes the attempt.
create or replace function public.league_preview(code text)
returns table (
  name           text,
  tier           public.league_tier,
  members        int,
  max_members    int,
  scope          text,
  top_n          smallint,
  already_member boolean,
  queued         boolean,
  is_full        boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  season uuid := public.current_season();
  cap    int := (select x.max_members::int from public.league_limits() x);
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001', hint = 'not_signed_in';
  end if;
  perform public.require_good_standing(uid);
  perform public.check_input_limit(uid, 'invite_code');
  if not exists (select 1 from public.leagues l where l.invite_code = lower(btrim(coalesce(code, '')))) then
    perform public.record_input_attempt(uid, 'invite_code');
    return;
  end if;

  return query
  with lg as (
    select l.id, l.name, l.tier from public.leagues l
    where l.invite_code = lower(btrim(coalesce(code, '')))
  ),
  card as (
    select e.locks_at from public.events e
    where e.status = 'scheduled' and e.locks_at > now()
    order by e.locks_at limit 1
  )
  select lg.name,
         lg.tier,
         (select count(*)::int from public.league_members m
          where m.league_id = lg.id
            and case when season is not null then m.status = 'active' else m.left_at is null end),
         cap,
         case when lg.tier in ('pro', 'hardcore') then r.scope end,
         case when lg.tier in ('pro', 'hardcore') then r.top_n end,
         exists (select 1 from public.league_members m
                 where m.league_id = lg.id and m.user_id = uid and m.left_at is null),
         season is not null,
         (select count(*)::int from public.league_members m where m.league_id = lg.id and m.left_at is null) >= cap
  from lg
  cross join lateral public.league_pick_rule(
    lg.id, coalesce((select c.locks_at from card c), 'infinity'::timestamptz)
  ) r;
end;
$$;

revoke execute on function public.league_preview(text) from public, anon;
grant execute on function public.league_preview(text) to authenticated;

-------------------------------------------------------------------------------
-- Starting leagues
-------------------------------------------------------------------------------

-- As before, and 5 a day. Only leagues actually started count.
create or replace function public.create_league(name text, tier public.league_tier default 'casual')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := public.require_named_player();
  clean  text := btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
  league uuid;
begin
  if tier = 'hardcore' then
    raise exception 'Hardcore leagues aren''t open yet.' using errcode = 'P0001', hint = 'tier_unavailable';
  end if;
  if char_length(clean) not between 1 and 40 then
    raise exception 'League names are 1 to 40 characters.' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- The display-name list, read word by word as it reads a handle.
  if public.display_name_blocked(replace(clean, ' ', '_')) then
    raise exception 'That name isn''t allowed.' using errcode = 'P0001', hint = 'blocked';
  end if;
  -- The limit's lock is taken first, so two creates at once can't both pass
  -- the capacity check either.
  perform public.check_input_limit(uid, 'create_league');
  perform public.check_league_capacity(uid);

  insert into public.leagues (name, owner_id, tier) values (clean, uid, tier)
  returning id into league;
  insert into public.league_members (league_id, user_id) values (league, uid);
  perform public.record_input_attempt(uid, 'create_league');
  return league;
end;
$$;

revoke execute on function public.create_league(text, public.league_tier) from public, anon;
grant execute on function public.create_league(text, public.league_tier) to authenticated;

-------------------------------------------------------------------------------
-- Push tokens
-------------------------------------------------------------------------------

-- As before, and an account keeps only its 10 most recently registered
-- phones, so a script can't fill the table or fan one push out to thousands.
create or replace function public.register_push_token(token text, platform text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (register_push_token.token, uid, register_push_token.platform, clock_timestamp())
  on conflict on constraint push_tokens_pkey do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at;

  delete from public.push_tokens t
  where t.user_id = uid
    and t.token not in (select k.token from public.push_tokens k where k.user_id = uid
                        order by k.updated_at desc, k.token limit 10);
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
