-- Season badges: awards won at a season's final drop, kept for good on the
-- player's profile.
--
-- Awards come at three levels:
--   - each fight week, the league cards on Home (community_card);
--   - half-season drops ('checkin', 'midseason'), announced in the reveal and
--     the league's awards, and never kept on a profile;
--   - the full-season drop ('final'), whose awards lock in as badges.
--
-- Pre-season drops are a dry run: they belong to no season, so they give no
-- badges and the Season 1 launch clears them. Deleting a final drop is the
-- only way to take its badges back.

create table public.award_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  season_id  uuid not null references public.seasons (id) on delete cascade,
  -- 'global', or a league's id.
  scope      text not null,
  league_id  uuid references public.leagues (id) on delete set null,
  -- The league's name when the badge was won, so a rename doesn't rewrite it.
  scope_name text not null,
  award      text not null,
  value      numeric,
  drop_id    uuid not null references public.award_drops (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, season_id, scope, award)
);

create index award_badges_drop_idx on public.award_badges (drop_id);

alter table public.award_badges enable row level security;
revoke all on public.award_badges from public, anon, authenticated;

-- Publishing a season's final drop locks its awards in.
create or replace function public.publish_award_drop(drop uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.award_drops%rowtype;
  n integer;
begin
  update public.award_drops x set published_at = now()
  where x.id = publish_award_drop.drop and x.published_at is null
  returning * into d;
  if not found then
    return 0;
  end if;

  if d.kind = 'final' and d.season_id is not null then
    insert into public.award_badges (user_id, season_id, scope, league_id, scope_name, award, value, drop_id)
    select a.user_id, d.season_id, a.scope, l.id, coalesce(l.name, 'Global'), a.award, a.value, d.id
    from public.drop_awards a
    left join public.leagues l on a.scope <> 'global' and l.id::text = a.scope
    where a.drop_id = d.id
    on conflict do nothing;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select distinct ds.user_id, 'awards', d.id::text,
         jsonb_build_object('label', d.label, 'kind', d.kind, 'dropId', d.id),
         false
  from public.drop_stats ds
  where ds.drop_id = d.id and ds.scope <> 'global'
  on conflict do nothing;
  get diagnostics n = row_count;

  perform public.invoke_activity_push();
  return n;
end;
$$;

revoke execute on function public.publish_award_drop(uuid) from public, anon, authenticated, service_role;

-- A player's badges, newest season first. A league's name shows only to
-- someone in that league (or the player); anyone else sees "League". Nothing
-- for a player you've blocked, or one deleted or banned.
create function public.player_badges(member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null
                or public.blocked_by_me(member)
                or exists (select 1 from public.profiles p where p.id = member and p.deleted_at is not null)
                or (select ps.standing from public.player_standing(member) ps) = 'banned'
           then '[]'::jsonb
           else coalesce((
             select jsonb_agg(jsonb_build_object(
                      'award', b.award,
                      'season', s.number,
                      'scope', case when b.scope = 'global' or member = (select auth.uid())
                                         or (b.league_id is not null and public.shares_league(b.league_id, member))
                                    then b.scope_name else 'League' end,
                      'value', b.value
                    ) order by s.number desc, b.scope = 'global' desc, b.award)
             from public.award_badges b join public.seasons s on s.id = b.season_id
             where b.user_id = member
           ), '[]'::jsonb)
         end;
$$;

revoke execute on function public.player_badges(uuid) from public, anon;
grant execute on function public.player_badges(uuid) to authenticated;

-- Half-season awards are announced, not kept, so profiles no longer show the
-- latest drop. Builds from before badges call this and hide the block.
create or replace function public.player_superlatives(member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select null::jsonb;
$$;
