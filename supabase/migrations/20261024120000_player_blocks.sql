-- Blocking players.
--
-- A player can block another. For the blocker, the blocked player shows as
-- "Blocked player" in league standings, matchups, the leaderboard, the
-- profile card and their inbox, and their league joins are no longer sent.
-- Nothing else changes: both stay in their leagues and still play each
-- other, and the blocked player isn't told. Apple's guideline 1.2 asks for
-- this in any app with content from other players.

-------------------------------------------------------------------------------
-- Blocks
-------------------------------------------------------------------------------

create table public.player_blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index player_blocks_blocked_idx on public.player_blocks (blocked);

-- Read and written only through the functions below, each scoped to the
-- caller, so nobody can see anyone else's blocks.
alter table public.player_blocks enable row level security;
revoke all on public.player_blocks from anon, authenticated;

-- True when the signed-in player has blocked `player`.
create function public.blocked_by_me(player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_blocks b
    where b.blocker = (select auth.uid()) and b.blocked = player
  );
$$;

revoke execute on function public.blocked_by_me(uuid) from public, anon, authenticated;

create function public.block_player(player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in to block a player.' using errcode = 'P0001';
  end if;
  if player = me then
    raise exception 'You can''t block yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = player and p.deleted_at is null) then
    raise exception 'That player is gone.' using errcode = 'P0001';
  end if;
  insert into public.player_blocks (blocker, blocked) values (me, player) on conflict do nothing;
end;
$$;

create function public.unblock_player(player uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.player_blocks where blocker = (select auth.uid()) and blocked = player;
$$;

-- The players you've blocked, newest first, with their names so you know who
-- you're unblocking.
create function public.my_blocks()
returns table (player uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked, coalesce(p.display_name, 'Player'), b.created_at
  from public.player_blocks b
  join public.profiles p on p.id = b.blocked
  where b.blocker = (select auth.uid()) and p.deleted_at is null
  order by b.created_at desc;
$$;

revoke execute on function public.block_player(uuid), public.unblock_player(uuid), public.my_blocks()
  from public, anon;
grant execute on function public.block_player(uuid), public.unblock_player(uuid), public.my_blocks()
  to authenticated;

-------------------------------------------------------------------------------
-- Hiding them from the blocker
-------------------------------------------------------------------------------

-- As before, and "Blocked player" to whoever blocked them. Standings,
-- matchups and the profile card all name players through this.
create or replace function public.league_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when uid is null then null
    when p.deleted_at is not null then 'Former Member'
    else case (select s.standing from public.player_standing(uid) s)
      when 'banned' then 'Former Member'
      else case
        when public.blocked_by_me(uid) then 'Blocked player'
        when (select s.standing from public.player_standing(uid) s) = 'suspended' then 'Suspended'
        else coalesce(p.display_name, 'Player')
      end
    end
  end
  from public.profiles p where p.id = uid;
$$;

-- As before, with whether you've blocked them, so the card offers Unblock.
drop function public.league_member_profile(uuid, uuid);

create function public.league_member_profile(league uuid, member uuid)
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
  where public.shares_league(league, member);
$$;

revoke execute on function public.league_member_profile(uuid, uuid) from public, anon;
grant execute on function public.league_member_profile(uuid, uuid) to authenticated;

-- As before, without telling an owner about a player they've blocked.
create or replace function public.queue_league_join(league uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues%rowtype;
begin
  select * into l from public.leagues where id = league;
  if not found or l.owner_id = member then
    return;
  end if;
  if exists (select 1 from public.player_blocks b where b.blocker = l.owner_id and b.blocked = member) then
    return;
  end if;
  if exists (
    select 1 from public.notifications_sent n
    where n.user_id = l.owner_id and n.kind = 'league_join'
      and n.key like league || ':' || member || ':%'
      and n.sent_at > now() - interval '7 days'
  ) then
    return;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  values (
    l.owner_id, 'league_join',
    league || ':' || member || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    jsonb_build_object('league', l.name, 'leagueId', l.id, 'member', public.league_display_name(member)),
    false
  );
  perform public.invoke_activity_push();
end;
$$;

-- As before. A join from someone you've since blocked names them as
-- "Blocked player". The key of a join is league:member:time.
create or replace function public.my_notifications(max_rows integer default 50)
returns table (kind text, key text, payload jsonb, sent_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.kind, n.key,
    case
      when n.kind = 'league_join'
       and exists (
         select 1 from public.player_blocks b
         where b.blocker = n.user_id and b.blocked::text = split_part(n.key, ':', 2)
       )
      then jsonb_set(n.payload, '{member}', '"Blocked player"')
      else n.payload
    end,
    n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;

-- As before, with players you've blocked as "Blocked player".
create or replace function public.season_leaderboard(max_rows integer default 100)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  points        bigint,
  correct       bigint,
  counted       bigint,
  cards         bigint,
  is_me         boolean,
  season_label  text
)
language sql
stable
security definer
set search_path = ''
as $$
  with season as (
    select id, number from public.seasons where starts_at is not null order by number desc limit 1
  ),
  totals as (
    select s.user_id,
           sum(s.points) as points,
           count(*) filter (where s.correct) as correct,
           count(*) filter (where s.counts_for_accuracy) as counted,
           count(distinct b.event_id) as cards
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.events e on e.id = b.event_id
    where e.season_id is not distinct from (select id from season)
    group by s.user_id
  ),
  standing as (
    select t.user_id, (select ps.standing from public.player_standing(t.user_id) ps) as standing
    from totals t
  ),
  ranked as (
    select rank() over (
             order by t.points desc,
                      case when t.counted = 0 then 0 else t.correct::numeric / t.counted end desc
           ) as rank,
           t.user_id,
           case
             when public.blocked_by_me(t.user_id) then 'Blocked player'
             when st.standing = 'suspended' then 'Suspended'
             else p.display_name
           end as display_name,
           t.points, t.correct, t.counted, t.cards,
           t.user_id = (select auth.uid()) as is_me
    from totals t
    join public.profiles p on p.id = t.user_id
    join standing st on st.user_id = t.user_id
    where p.deleted_at is null and p.display_name is not null and st.standing <> 'banned'
  )
  select r.rank, r.user_id, r.display_name, r.points, r.correct, r.counted, r.cards, r.is_me,
         coalesce((select 'SEASON ' || number from season), 'PRE-SEASON')
  from ranked r
  where r.rank <= greatest(max_rows, 1) or r.is_me
  order by r.rank, r.display_name;
$$;
