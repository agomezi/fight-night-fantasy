-- Poll pushes: the take Home shows goes to players who want it and haven't
-- voted, in their daytime, at most once every 3 days and never twice for one
-- take; banned, suspended and unfinished accounts get nothing; fight night
-- sends none; the league activity claim leaves them alone; and builds before
-- this one don't see them in their inbox.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- A card three days out, so Home shows one of its takes.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'pq1', 'name', 'UFC Fight Night: Ask vs. Tell', 'startsAt', now() + interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', (
    select jsonb_agg(jsonb_build_object('ufcFightId', 'pq1' || o, 'order', o, 'segment', 'main',
      'scheduledRounds', 3, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'pq1r' || o, 'name', 'Red Fighter ' || o, 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'pq1b' || o, 'name', 'Blue Fighter ' || o, 'nickname', null)))
    from generate_series(1, 2) o)));
select public.ensure_community();

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ev() returns uuid language sql as $$ select id from public.events where ufc_event_id = 'pq1' $$;
-- Tomorrow at noon Eastern: daytime there, the middle of the night in Tokyo.
create function pg_temp.noon() returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'America/New_York') + interval '1 day 12 hours') at time zone 'America/New_York'
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.queued() returns int[] language sql as $$
  select coalesce(array_agg(right(n.user_id::text, 2)::int order by n.user_id), '{}')
  from public.notifications_sent n where n.kind = 'poll' and n.user_id::text like '00000000-0000-0000-0000-0000000002%'
$$;

-- 01 voted already, 02 turned poll pushes off, 03 is banned, 04 lives in
-- Tokyo, 05 should get it, 06 is suspended, 07 never finished signing up,
-- 08 had a poll push two days ago.
insert into auth.users (id, email) select pg_temp.u(n), 'pq' || n || '@example.test' from generate_series(1, 8) n;
update public.profiles p set display_name = 'Asker' || v.n from generate_series(1, 8) v(n) where p.id = pg_temp.u(v.n) and v.n <> 7;
update public.profiles set notify_polls = false where id = pg_temp.u(2);
update public.profiles set time_zone = 'Asia/Tokyo' where id = pg_temp.u(4);
set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action, expires_at)
values (0, pg_temp.u(3), 'ban', null), (0, pg_temp.u(6), 'suspend', now() + interval '30 days');
set local session_replication_role = origin;
insert into public.notifications_sent (user_id, kind, key, payload, pushed, sent_at)
values (pg_temp.u(8), 'poll', 'an-older-take', '{"question": "Older?"}', true, pg_temp.noon() - interval '2 days');
insert into public.poll_votes (poll_id, user_id, option)
values (public.home_poll_at(pg_temp.noon()), pg_temp.u(1), 'yes');

-------------------------------------------------------------------------------
-- Queueing
-------------------------------------------------------------------------------

select isnt(public.home_poll_at(pg_temp.noon()), null, 'Home shows a take the day before a card');
select is(public.home_poll_at(pg_temp.noon()),
  ((public.community_card_at(null, pg_temp.u(5), pg_temp.noon())) -> 'poll' ->> 'id')::uuid,
  'the take is the one on Home');
select ok((select bool_and(public.home_poll_at(pg_temp.noon() + d * interval '1 day') is not distinct from
             case when c ->> 'type' = 'poll' and c ->> 'phase' = 'open' then (c -> 'poll' ->> 'id')::uuid end)
           from generate_series(0, 2) d,
                lateral (select public.community_card_at(null, pg_temp.u(5), pg_temp.noon() + d * interval '1 day') as c) x),
  'every day of fight week');

select is(public.queue_poll_notifications(pg_temp.noon()), 1, 'one player is queued');
select is(pg_temp.queued(), array[5, 8], 'only the player who wants it, hasn''t voted and is awake');
select is((select n.payload ->> 'question' from public.notifications_sent n where n.user_id = pg_temp.u(5) and n.kind = 'poll'),
  (select p.question from public.community_polls p where p.id = public.home_poll_at(pg_temp.noon())),
  'the push carries the question');
select is((select n.key from public.notifications_sent n where n.user_id = pg_temp.u(5) and n.kind = 'poll'),
  public.home_poll_at(pg_temp.noon())::text, 'keyed by the take');
select ok((select (n.payload ->> 'closesAt')::timestamptz > pg_temp.noon() from public.notifications_sent n
           where n.user_id = pg_temp.u(5) and n.kind = 'poll'), 'with when it closes');

select is(public.queue_poll_notifications(pg_temp.noon()), 0, 'running again queues nothing');
select public.queue_poll_notifications(pg_temp.noon() + interval '1 day');
select is((select count(*)::int from public.notifications_sent n where n.user_id = pg_temp.u(5) and n.kind = 'poll'), 1,
  'nor does the next day''s take, within the 3 days');

-- Tokyo's daytime is Eastern's night: 04 gets it then, as long as Home still
-- shows the same take.
select is(public.queue_poll_notifications(pg_temp.noon() + interval '12 hours'),
  case when public.home_poll_at(pg_temp.noon() + interval '12 hours') is not null then 1 else 0 end,
  'a player in another zone gets it in their own daytime');

-- 3 days on, 05 can be sent one again.
update public.notifications_sent set key = 'an-earlier-take', pushed = true, sent_at = pg_temp.noon() - interval '4 days'
where user_id = pg_temp.u(5) and kind = 'poll';
select is(public.queue_poll_notifications(pg_temp.noon()), 1, 'after 3 days a player can get another');

-- Fight night sends nothing.
select is(public.home_poll_at((select e.locks_at from public.events e where e.id = pg_temp.ev()) + interval '1 minute'), null,
  'no take is pushed once the card is under way');

-------------------------------------------------------------------------------
-- Sending
-------------------------------------------------------------------------------

select is((select count(*)::int from public.claim_activity_notifications() c where c.kind = 'poll'), 0,
  'the league activity claim never sends a poll push');
select ok((select bool_and(not n.pushed) from public.notifications_sent n
           where n.kind = 'poll' and n.user_id = pg_temp.u(5) and n.key <> 'an-earlier-take'),
  'and leaves it for the poll claim');

insert into public.push_tokens (user_id, token) values (pg_temp.u(5), 'ExponentPushToken[pq5]');
select is((select jsonb_agg(jsonb_build_object('to', right(c.user_id::text, 2), 'wanted', c.wanted, 'tokens', c.tokens))
           from public.claim_poll_notifications(pg_temp.noon()) c where c.user_id = pg_temp.u(5)),
  '[{"to": "05", "wanted": true, "tokens": ["ExponentPushToken[pq5]"]}]'::jsonb, 'the poll claim sends it');
select is((select count(*)::int from public.claim_poll_notifications(pg_temp.noon())), 0, 'once');

-- Checked again as it goes out. Each of these is dropped unsent, and deleted
-- so it neither shows in the inbox nor counts toward the 3 days.
create function pg_temp.requeue(take text) returns void language sql as $$
  insert into public.notifications_sent (user_id, kind, key, payload, pushed, sent_at)
  values (pg_temp.u(5), 'poll', take, '{"question": "Again?"}', false, pg_temp.noon())
  on conflict (user_id, kind, key) do update set pushed = false
$$;
create function pg_temp.dropped(take text) returns boolean language plpgsql as $$
declare
  sent boolean;
begin
  sent := exists (select 1 from public.claim_poll_notifications(pg_temp.noon()) c where c.user_id = pg_temp.u(5));
  return not sent
     and not exists (select 1 from public.notifications_sent n where n.user_id = pg_temp.u(5) and n.kind = 'poll' and n.key = take);
end;
$$;

update public.profiles set notify_polls = false where id = pg_temp.u(5);
select pg_temp.requeue(public.home_poll_at(pg_temp.noon())::text);
select ok(pg_temp.dropped(public.home_poll_at(pg_temp.noon())::text), 'a player who turned them off since isn''t sent it');
update public.profiles set notify_polls = true where id = pg_temp.u(5);

select pg_temp.requeue('00000000-0000-0000-0000-00000000dead');
select ok(pg_temp.dropped('00000000-0000-0000-0000-00000000dead'), 'nor is a take Home no longer shows');

update public.profiles set time_zone = 'Asia/Tokyo' where id = pg_temp.u(5);
select pg_temp.requeue(public.home_poll_at(pg_temp.noon())::text);
select ok(pg_temp.dropped(public.home_poll_at(pg_temp.noon())::text), 'nor one that would land in the night');
update public.profiles set time_zone = null where id = pg_temp.u(5);

set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action, expires_at)
values (0, pg_temp.u(5), 'suspend', now() + interval '1 day');
set local session_replication_role = origin;
select pg_temp.requeue(public.home_poll_at(pg_temp.noon())::text);
select ok(pg_temp.dropped(public.home_poll_at(pg_temp.noon())::text), 'nor one to a player suspended since');

-------------------------------------------------------------------------------
-- The inbox, and who can call what
-------------------------------------------------------------------------------

-- An older build's inbox still fills up with what it can show, however many
-- poll pushes are newer.
insert into public.notifications_sent (user_id, kind, key, payload, sent_at)
values (pg_temp.u(5), 'final', 'an-old-card', '{"event": "UFC 1", "points": 10, "hit": 1, "total": 2}', now() - interval '30 days');
insert into public.notifications_sent (user_id, kind, key, payload, read_at)
select pg_temp.u(5), 'poll', 'filler-' || n, '{"question": "Filler?"}', now() from generate_series(1, 60) n;

set local role authenticated;
select pg_temp.act(5);
select is((select array_agg(i.kind) from public.inbox_items(50) i), array['final'],
  'and the last build''s inbox isn''t crowded out by them');
select ok(exists (select 1 from public.inbox_items_v2(50) i where i.kind = 'poll'), 'this build''s inbox shows poll pushes');
select is((select count(*)::int from public.inbox_items(50) i where i.kind = 'poll'), 0, 'the last build''s inbox doesn''t');
select is((select count(*)::int from public.my_notifications(50) i where i.kind = 'poll'), 0, 'nor do older builds''');
select is(public.inbox_unread_count_v2() - public.inbox_unread_count(), 1, 'nor do they count them as unread');
select is(public.unread_notification_count(), 1, 'nor do older builds');

select throws_ok($$select * from public.claim_poll_notifications()$$, '42501', null, 'players can''t claim pushes');
select throws_ok($$select public.queue_poll_notifications()$$, '42501', null, 'or queue them');

select * from finish();
rollback;
