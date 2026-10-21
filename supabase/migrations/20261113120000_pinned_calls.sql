-- Pinned calls: a player pins up to 3 of their best calls to their profile,
-- where anyone who opens their card sees them.
--
-- Only a call that came in, on a final result, can be pinned. If a
-- correction later makes it wrong, it drops off the profile by itself.

create table public.pinned_picks (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  bout_id   uuid not null references public.bouts (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, bout_id)
);

alter table public.pinned_picks enable row level security;
revoke all on public.pinned_picks from public, anon, authenticated;

-- How many calls a profile shows.
create function public.max_pinned_calls() returns integer language sql immutable set search_path = '' as $$ select 3 $$;
revoke execute on function public.max_pinned_calls() from public, anon, authenticated, service_role;

-- Whether this call is one its owner could pin: they picked it as the bout
-- stands, it scored as correct, and the result is final.
create function public.pinnable_call(player uuid, bout uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.picks k
    join public.bouts b on b.id = k.bout_id and k.bout_version = b.version
    join public.scores s on s.user_id = k.user_id and s.bout_id = k.bout_id
    join public.results r on r.bout_id = k.bout_id
    where k.user_id = player and k.bout_id = bout
      and s.correct and s.counts_for_accuracy and r.status = 'final'
  );
$$;

revoke execute on function public.pinnable_call(uuid, uuid) from public, anon, authenticated, service_role;

create function public.pin_call(bout uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in to pin a call.' using errcode = 'P0001';
  end if;
  if not public.pinnable_call(me, bout) then
    raise exception 'Only a call you got right, on a final result, can be pinned.' using errcode = 'P0001', hint = 'invalid';
  end if;
  -- Taken under a lock per player, so two pins at once can't pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('pinned_picks:' || me, 0));
  if exists (select 1 from public.pinned_picks p where p.user_id = me and p.bout_id = bout) then
    return;
  end if;
  -- A pin a correction has since made wrong is hidden, so it gives its
  -- place back rather than holding one nobody can see to unpin.
  delete from public.pinned_picks p where p.user_id = me and not public.pinnable_call(me, p.bout_id);
  if (select count(*) from public.pinned_picks p where p.user_id = me) >= public.max_pinned_calls() then
    raise exception 'You can pin % calls. Unpin one first.', public.max_pinned_calls()
      using errcode = 'P0001', hint = 'pin_limit';
  end if;
  insert into public.pinned_picks (user_id, bout_id) values (me, bout);
end;
$$;

create function public.unpin_call(bout uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pinned_picks p where p.user_id = (select auth.uid()) and p.bout_id = bout;
$$;

-- A player's pinned calls, newest pinned first, for anyone signed in: on
-- their profile and on the card others open from a league or the
-- leaderboard. None for a player you've blocked, or one deleted or banned.
-- A call a correction has since made wrong isn't shown.
create function public.pinned_calls(member uuid)
returns table (
  bout_id     uuid,
  event_name  text,
  event_date  timestamptz,
  red_name    text,
  blue_name   text,
  picked_name text,
  finish      public.finish_kind,
  finish_round smallint,
  method      public.pick_method,
  points      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bout_id, e.name, e.starts_at, rf.name, bf.name, pf.name, k.finish, k.finish_round, k.method, s.points
  from public.pinned_picks p
  join public.profiles pr on pr.id = p.user_id
  join public.picks k on k.user_id = p.user_id and k.bout_id = p.bout_id
  join public.bouts b on b.id = p.bout_id
  join public.events e on e.id = b.event_id
  join public.fighters rf on rf.id = b.red_fighter_id
  join public.fighters bf on bf.id = b.blue_fighter_id
  join public.fighters pf on pf.id = k.picked_fighter_id
  join public.scores s on s.user_id = p.user_id and s.bout_id = p.bout_id
  where p.user_id = member
    and (select auth.uid()) is not null
    and pr.deleted_at is null
    and (select ps.standing from public.player_standing(member) ps) is distinct from 'banned'
    and not public.blocked_by_me(member)
    and public.pinnable_call(member, p.bout_id)
  order by p.pinned_at desc
  limit public.max_pinned_calls();
$$;

revoke execute on function public.pin_call(uuid), public.unpin_call(uuid), public.pinned_calls(uuid) from public, anon;
grant execute on function public.pin_call(uuid), public.unpin_call(uuid), public.pinned_calls(uuid) to authenticated;
