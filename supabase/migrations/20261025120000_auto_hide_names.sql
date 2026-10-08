-- Hiding a heavily reported name until a moderator gets to it.
--
-- When a player's open case has reports from 3 distinct established reporters
-- (an account 7+ days old with a score, see reporter_established), their name
-- shows as "Player" to everyone else: league standings, matchups, the
-- leaderboard, the profile card and league-join notifications. They still
-- see their own name, and get one inbox note saying it's under review.
--
-- Nothing is stored and no punishment is applied. The hiding follows the open
-- case: dismissing it brings the name back, and a reset means picking a new
-- one. A moderator's name is never hidden.

-------------------------------------------------------------------------------
-- When a name is hidden
-------------------------------------------------------------------------------

-- How many distinct established reporters hide a name.
create function public.auto_hide_threshold()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

-- True when `player` has an open case with enough established reporters to
-- hide their name, and isn't a moderator.
create function public.name_hidden(player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.moderation_cases c
    join public.profiles p on p.id = c.player
    where c.player = name_hidden.player and c.status = 'open' and not p.is_moderator
      and (
        select count(distinct r.reporter_id) from public.name_reports r
        where r.case_id = c.id and public.reporter_established(r.reporter_id)
      ) >= public.auto_hide_threshold()
  );
$$;

revoke execute on function public.auto_hide_threshold(), public.name_hidden(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Telling the player
-------------------------------------------------------------------------------

-- The report that hides a name sends its owner one note per case.
create function public.notify_name_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.name_hidden(new.reported_id) then
    insert into public.notifications_sent (user_id, kind, key, payload, pushed)
    values (new.reported_id, 'moderation', new.case_id || ':under_review', '{"action": "under_review"}', false)
    on conflict do nothing;
    if found then
      perform public.invoke_activity_push();
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_name_hidden() from public, anon, authenticated;

create trigger name_reports_hide after insert on public.name_reports
  for each row execute function public.notify_name_hidden();

-------------------------------------------------------------------------------
-- How players appear
-------------------------------------------------------------------------------

-- As before, and "Player" to everyone else while the name is hidden.
-- Standings, matchups and the profile card all name players through this.
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
        when uid is distinct from (select auth.uid()) and public.name_hidden(uid) then 'Player'
        else coalesce(p.display_name, 'Player')
      end
    end
  end
  from public.profiles p where p.id = uid;
$$;

-- As before, with hidden names as "Player" to everyone else.
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
             when t.user_id is distinct from (select auth.uid()) and public.name_hidden(t.user_id) then 'Player'
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

-- As before. The joining player is the one signed in, so their hidden name is
-- swapped out here rather than by league_display_name.
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
    jsonb_build_object(
      'league', l.name, 'leagueId', l.id,
      'member', case when public.name_hidden(member) then 'Player' else public.league_display_name(member) end
    ),
    false
  );
  perform public.invoke_activity_push();
end;
$$;

-- As before. A join from someone whose name is now hidden names them as
-- "Player". The key of a join is league:member:time.
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
      when n.kind = 'league_join' and public.name_hidden(split_part(n.key, ':', 2)::uuid)
      then jsonb_set(n.payload, '{member}', '"Player"')
      else n.payload
    end,
    n.sent_at, n.read_at is not null
  from public.notifications_sent n
  where n.user_id = (select auth.uid()) and n.payload is not null
  order by n.sent_at desc, n.key
  limit least(greatest(max_rows, 1), 200);
$$;
