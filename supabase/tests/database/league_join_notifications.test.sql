-- League join notifications and the inbox: the owner hears once per join,
-- never about themselves, at most once a week per player; the toggle only
-- stops the push and never releases a backlog; card notifications land in
-- the inbox too; and players can only read and clear their own.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- 01 Owen owns the league, 02 Sam and 03 Tia join it.
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'lj' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = v.name
from (values (1, 'Owen'), (2, 'Sam'), (3, 'Tia')) v(n, name)
where p.id = pg_temp.u(v.n);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create temp table lg (id uuid, code text);
grant all on lg to authenticated;
create function pg_temp.joins(member int) returns int language sql as $$
  select count(*)::int from public.notifications_sent
  where user_id = pg_temp.u(1) and kind = 'league_join' and key like (select id from lg) || ':' || pg_temp.u(member) || ':%'
$$;

set local role authenticated;
select pg_temp.act(1);
select public.register_push_token('ExponentPushToken[owen-phone]', 'ios');
insert into lg select public.create_league('Weekend Warriors'), null;
update lg set code = (select invite_code from public.leagues where id = lg.id);
reset role;

select is((select count(*)::int from public.notifications_sent where kind = 'league_join'), 0,
  'creating your own league notifies no one');

-------------------------------------------------------------------------------
-- Joining
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(2);
select public.join_league((select code from lg));
reset role;

select results_eq(
  $$select payload, pushed from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'league_join'$$,
  $$values (jsonb_build_object('league', 'Weekend Warriors', 'leagueId', (select id from lg), 'member', 'Sam'), false)$$,
  'a join records one notification for the owner, waiting to be pushed'
);

set local role authenticated;
select pg_temp.act(2);
select public.join_league((select code from lg));
select public.leave_league((select id from lg));
select public.join_league((select code from lg));
reset role;
select is(pg_temp.joins(2), 1, 'joining again, or leaving and rejoining within the week, adds nothing');

-------------------------------------------------------------------------------
-- Claiming and pushing
-------------------------------------------------------------------------------

set local role service_role;
select results_eq(
  $$select user_id, kind, payload->>'member', tokens, wanted from public.claim_activity_notifications()$$,
  $$values (pg_temp.u(1), 'league_join'::text, 'Sam'::text, array['ExponentPushToken[owen-phone]'], true)$$,
  'the sender claims it with the owner''s phones, wanted'
);
select is_empty($$select * from public.claim_activity_notifications()$$, 'and it is claimed only once');
reset role;

-- The owner turns league activity off; Tia joins.
update public.profiles set notify_league_activity = false where id = pg_temp.u(1);
set local role authenticated;
select pg_temp.act(3);
select public.join_league((select code from lg));
set local role service_role;
select results_eq(
  $$select kind, wanted from public.claim_activity_notifications()$$,
  $$values ('league_join'::text, false)$$,
  'with the toggle off it is claimed but not wanted, so nothing is pushed'
);
reset role;
update public.profiles set notify_league_activity = true where id = pg_temp.u(1);
set local role service_role;
select is_empty($$select * from public.claim_activity_notifications()$$,
  'turning the toggle back on releases no backlog');
reset role;

-- A week on, Sam leaves and comes back: that is news again.
update public.notifications_sent set sent_at = now() - interval '8 days'
where user_id = pg_temp.u(1) and kind = 'league_join' and key like '%' || pg_temp.u(2) || '%';
set local role authenticated;
select pg_temp.act(2);
select public.leave_league((select id from lg));
select public.join_league((select code from lg));
reset role;
select is(pg_temp.joins(2), 2, 'rejoining after a week notifies the owner again');

-- One the sender never got to for over a day is claimed but not pushed.
update public.notifications_sent set sent_at = now() - interval '2 days'
where user_id = pg_temp.u(1) and kind = 'league_join' and not pushed;
set local role service_role;
select results_eq($$select wanted from public.claim_activity_notifications()$$, $$values (false)$$,
  'a join more than a day old is not pushed late');
reset role;

-- The owner leaving and rejoining their own league tells no one.
set local role authenticated;
select pg_temp.act(1);
select public.leave_league((select id from lg));
reset role;
-- Ownership passed to Sam when Owen left; Owen rejoining notifies Sam.
set local role authenticated;
select pg_temp.act(1);
select public.join_league((select code from lg));
reset role;
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(2) and kind = 'league_join'), 1,
  'the new owner hears when the old owner rejoins');
select is((select payload->>'member' from public.notifications_sent where user_id = pg_temp.u(2) and kind = 'league_join'), 'Owen',
  'with the joiner''s name');

-------------------------------------------------------------------------------
-- Who can do what
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(2);
select throws_ok($$select * from public.claim_activity_notifications()$$, '42501', null, 'players cannot claim notifications');
select throws_ok($$select public.queue_league_join((select id from lg), pg_temp.u(3))$$, '42501', null,
  'players cannot queue a join notification');
select throws_ok($$select public.invoke_activity_push()$$, '42501', null, 'players cannot trigger the sender');
select throws_ok($$select * from public.notifications_sent$$, '42501', null, 'players cannot read the table directly');
reset role;

-------------------------------------------------------------------------------
-- Inbox
-------------------------------------------------------------------------------

-- A notification from before the inbox, with no payload, stays out of it.
insert into public.notifications_sent (user_id, kind, key) values (pg_temp.u(1), 'final', 'old-card');

-- Card notifications are kept for the inbox now too.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'lj1', 'name', 'UFC 998: Inbox vs. Test', 'startsAt', now() + interval '30 minutes',
  'status', 'scheduled', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    jsonb_build_object('ufcFightId', 'lj11', 'order', 1, 'segment', 'main', 'scheduledRounds', 5, 'weightClass', null,
      'red', jsonb_build_object('ufcFighterId', 'ljr', 'name', 'Red', 'nickname', null),
      'blue', jsonb_build_object('ufcFighterId', 'ljb', 'name', 'Blue', 'nickname', null)))));
set local role service_role;
select results_eq($$select kind from public.claim_reminders() where user_id = pg_temp.u(1)$$, $$values ('reminder'::text)$$,
  'a lock reminder is still claimed as before');
reset role;
select is((select payload->>'event' from public.notifications_sent where user_id = pg_temp.u(1) and kind = 'reminder'),
  'UFC 998: Inbox vs. Test', 'and keeps its payload for the inbox');

set local role authenticated;
select pg_temp.act(1);
select results_eq(
  $$select kind, read from public.my_notifications() order by kind$$,
  $$values ('league_join'::text, false), ('league_join', false), ('league_join', false), ('reminder', false)$$,
  'the inbox lists your notifications with a payload, unread'
);
select is(public.unread_notification_count(), 4, 'and counts them unread');
select public.mark_notifications_read();
select is(public.unread_notification_count(), 0, 'marking read clears the count');
select is((select count(*)::int from public.my_notifications() where read), 4, 'and the inbox shows them read');

select pg_temp.act(3);
select is_empty($$select * from public.my_notifications()$$, 'nobody sees another player''s inbox');
select public.mark_notifications_read();
reset role;
select is((select count(*)::int from public.notifications_sent where user_id = pg_temp.u(2) and read_at is not null), 0,
  'and marking your own read leaves everyone else''s alone');

select * from finish();
rollback;
