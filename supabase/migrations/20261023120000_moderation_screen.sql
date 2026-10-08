-- The moderation screen, and alerts for moderators.
--
-- Moderators review and act on cases in the app instead of the SQL editor.
-- Everything here checks profiles.is_moderator on the server; hiding the
-- screen from other players is not the security.
--
--   moderation_queue()          open cases, most reporters first, then oldest
--   moderation_case(case)       one case: the player, every report, and the
--                               player's past actions
--   moderation_history(rows)    recent actions across all players
--   am_moderator()              whether to show the entry in Settings
--
-- Every moderator is alerted (kind moderation_case) when a case opens and
-- again when it reaches three reporters.

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

-- Refuses anyone who isn't a moderator. The SQL editor and the service role
-- are trusted, as with moderate().
create function public.require_moderator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated')
     and not coalesce((select p.is_moderator from public.profiles p where p.id = (select auth.uid())), false) then
    raise exception 'Only moderators can do that.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_moderator() from public, anon, authenticated;

create function public.am_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_moderator from public.profiles p where p.id = (select auth.uid())), false);
$$;

revoke execute on function public.am_moderator() from public, anon;
grant execute on function public.am_moderator() to authenticated;

-------------------------------------------------------------------------------
-- Reading
-------------------------------------------------------------------------------

create function public.moderation_queue()
returns table (
  case_id   bigint,
  player    uuid,
  name      text,
  reporters integer,
  reasons   text[],
  opened_at timestamptz,
  strikes   integer,
  standing  text,
  protected boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  return query
  select c.id, c.player, p.display_name,
         count(distinct r.reporter_id)::integer,
         coalesce(array_agg(distinct r.reason) filter (where r.reason is not null), '{}'),
         c.opened_at,
         public.player_strikes(c.player),
         (select s.standing from public.player_standing(c.player) s),
         p.is_moderator
  from public.moderation_cases c
  join public.profiles p on p.id = c.player
  left join public.name_reports r on r.case_id = c.id
  where c.status = 'open'
  group by c.id, c.player, p.display_name, p.is_moderator, c.opened_at
  order by count(distinct r.reporter_id) desc, c.opened_at, c.id;
end;
$$;

-- One case as a document: the case, the player, its reports (newest first)
-- and every action ever taken against the player (newest first).
create function public.moderation_case(case_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c   public.moderation_cases%rowtype;
  doc jsonb;
begin
  perform public.require_moderator();
  select * into c from public.moderation_cases mc where mc.id = moderation_case.case_id;
  if not found then
    raise exception 'There''s no case %.', moderation_case.case_id using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'openedAt', c.opened_at,
    'resolvedAt', c.resolved_at,
    'resolvedBy', (select rb.display_name from public.profiles rb where rb.id = c.resolved_by),
    'player', jsonb_build_object(
      'id', c.player,
      'name', p.display_name,
      'pastNames', to_jsonb(array(
        select h.display_name from public.display_name_history h
        where h.user_id = c.player order by h.changed_at desc
      )),
      'standing', s.standing,
      'until', s.until,
      'strikes', public.player_strikes(c.player),
      'protected', p.is_moderator
    ),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'reportedName', r.display_name,
          'reason', r.reason,
          'note', r.note,
          'league', l.name,
          'reporter', rp.display_name,
          'reporterEstablished', public.reporter_established(r.reporter_id),
          'at', r.created_at
        ) order by r.created_at desc, r.id desc)
      from public.name_reports r
      join public.profiles rp on rp.id = r.reporter_id
      left join public.leagues l on l.id = r.league_id
      where r.case_id = c.id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'caseId', a.case_id,
          'action', a.action,
          'reason', a.reason,
          'note', a.note,
          'expiresAt', a.expires_at,
          'moderator', m.display_name,
          'at', a.created_at
        ) order by a.created_at desc, a.id desc)
      from public.moderation_actions a
      left join public.profiles m on m.id = a.moderator
      where a.player = c.player
    ), '[]'::jsonb)
  ) into doc
  from public.profiles p, public.player_standing(c.player) s
  where p.id = c.player;

  return doc;
end;
$$;

create function public.moderation_history(max_rows integer default 50)
returns table (
  action_id   bigint,
  case_id     bigint,
  player      uuid,
  player_name text,
  action      text,
  reason      text,
  note        text,
  expires_at  timestamptz,
  moderator   text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  return query
  select a.id, a.case_id, a.player, p.display_name, a.action, a.reason, a.note, a.expires_at,
         m.display_name, a.created_at
  from public.moderation_actions a
  join public.profiles p on p.id = a.player
  left join public.profiles m on m.id = a.moderator
  order by a.created_at desc, a.id desc
  limit least(greatest(max_rows, 1), 200);
end;
$$;

revoke execute on function public.moderation_queue(), public.moderation_case(bigint), public.moderation_history(integer)
  from public, anon;
grant execute on function public.moderation_queue(), public.moderation_case(bigint), public.moderation_history(integer)
  to authenticated, service_role;

-------------------------------------------------------------------------------
-- Resetting a name from the app
-------------------------------------------------------------------------------

-- A moderator acting in the app runs as authenticated, which the rename
-- trigger would hold to the player's own limits. reset_display_name marks
-- the reset for the length of the update, so the trigger lets it through.
-- Players can't set the mark: set_config isn't reachable through the API.
create or replace function public.reset_display_name(player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.moderator_reset', 'on', true);
  update public.profiles set display_name = null where id = player;
  perform set_config('app.moderator_reset', '', true);
end;
$$;

-- As before, letting a moderator's reset through.
create or replace function public.track_display_name()
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
     and coalesce(current_setting('app.moderator_reset', true), '') <> 'on'
     and old.display_name is not null then
    perform public.require_good_standing(old.id);
    if old.name_changed_at > now() - interval '7 days' then
      raise exception 'You can change your name once a week.'
        using errcode = 'P0001', hint = 'too_soon',
              detail = to_char(old.name_changed_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
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

-------------------------------------------------------------------------------
-- Alerts
-------------------------------------------------------------------------------

alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('reminder', 'scored', 'final', 'league_join', 'moderation', 'moderation_case'));

-- Tells every moderator when a case opens and when it reaches three
-- reporters. Each player reports another once, so the reports in a case
-- are its reporters. A moderator is never alerted about a case on themselves.
create function public.alert_moderators()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
  stage     text;
begin
  select count(*) into reporters from public.name_reports r where r.case_id = new.case_id;
  stage := case reporters when 1 then 'opened' when 3 then 'three' end;
  if stage is null then
    return null;
  end if;

  insert into public.notifications_sent (user_id, kind, key, payload, pushed)
  select m.id, 'moderation_case', new.case_id || ':' || stage,
    jsonb_build_object(
      'caseId', new.case_id,
      'stage', stage,
      'name', new.display_name,
      'reason', new.reason,
      'reporters', reporters
    ),
    false
  from public.profiles m
  where m.is_moderator and m.deleted_at is null and m.id <> new.reported_id
  on conflict do nothing;

  if found then
    perform public.invoke_activity_push();
  end if;
  return null;
end;
$$;

revoke execute on function public.alert_moderators() from public, anon, authenticated;

create trigger name_reports_alert after insert on public.name_reports
  for each row execute function public.alert_moderators();

-- As before. Moderation notices and case alerts are pushed whatever the
-- player's settings.
create or replace function public.claim_activity_notifications()
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notifications_sent n set pushed = true
    where not n.pushed
    returning n.user_id, n.kind, n.payload, n.sent_at
  )
  select c.user_id, c.kind, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    (c.kind in ('moderation', 'moderation_case') or p.notify_league_activity) and c.sent_at > now() - interval '1 day'
  from claimed c
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
$$;
