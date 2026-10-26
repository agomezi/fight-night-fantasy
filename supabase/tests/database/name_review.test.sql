-- Name review: a hidden name shows as "Player #NNNN", the tag of its case;
-- the hidden player can rename once without the weekly limit and is seen by
-- the new name at once; the held name can't be taken meanwhile; dismissing
-- puts it back and frees the new one; an action against it retires it; and a
-- former member is tagged too.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- 01 Kilo owns a league everyone joins. 02 Lima, 03 Mike and 04 Nova get
-- reported by 05 Oscar, 06 Papa and 07 Quinn, who are established. 08 Romeo
-- deletes his account. 09 Sierra is a moderator.
insert into auth.users (id, email) select pg_temp.u(n), 'nr' || n || '@example.test' from generate_series(1, 9) n;
update public.profiles p set display_name = v.name, created_at = now() - interval '30 days'
from (values (1, 'Kilo'), (2, 'Lima'), (3, 'Mike'), (4, 'Nova'), (5, 'Oscar'), (6, 'Papa'), (7, 'Quinn'),
             (8, 'Romeo'), (9, 'Sierra')) v(n, name)
where p.id = pg_temp.u(v.n);
update public.profiles set is_moderator = true where id = pg_temp.u(9);

create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
create temp table lg (id uuid, code text);
grant all on lg to authenticated;

set local role authenticated;
select pg_temp.act(1);
insert into lg select public.create_league('Gym League'), null;
update lg set code = (select invite_code from public.leagues where id = lg.id);
select pg_temp.act(2); select public.join_league((select code from lg));
select pg_temp.act(3); select public.join_league((select code from lg));
select pg_temp.act(4); select public.join_league((select code from lg));
select pg_temp.act(5); select public.join_league((select code from lg));
select pg_temp.act(6); select public.join_league((select code from lg));
select pg_temp.act(7); select public.join_league((select code from lg));
select pg_temp.act(8); select public.join_league((select code from lg));
select pg_temp.act(9); select public.join_league((select code from lg));
reset role;

-- A score each, so the reporters count as established.
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'nr1', 'name', 'Card nr1', 'startsAt', now() - interval '3 days', 'status', 'scheduled',
  'issues', '[]'::jsonb, 'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'nr11', 'order', 1, 'segment', 'main',
    'scheduledRounds', 3, 'weightClass', 'Lightweight',
    'red', jsonb_build_object('ufcFighterId', 'nr1r', 'name', 'Red', 'nickname', null),
    'blue', jsonb_build_object('ufcFighterId', 'nr1b', 'name', 'Blue', 'nickname', null)))));
insert into public.scores (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy)
select pg_temp.u(n), b.id, e.season_id, 10, 10, '{}'::jsonb, true, true
from public.bouts b join public.events e on e.id = b.event_id, generate_series(1, 9) n
where b.ufc_fight_id = 'nr11';

-- Everyone changed their name yesterday, so a normal rename is refused.
update public.profiles set name_changed_at = now() - interval '1 day';

create function pg_temp.report(by int, who int) returns boolean language sql as $$
  select pg_temp.act(by);
  select public.report_league_member((select id from lg), pg_temp.u(who), 'offensive name');
$$;
create function pg_temp.kilo_sees(who int) returns text language sql as $$
  select pg_temp.act(1);
  select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(who);
$$;
create function pg_temp.case_of(n int) returns bigint language sql as $$
  select id from public.moderation_cases where player = pg_temp.u(n) and status = 'open'
$$;
-- Each case's tag, recorded as the owner so players can compare against it.
create temp table tags (n int primary key, tag text);
grant select on tags to authenticated;
create function pg_temp.tag(n int) returns text language sql as $$
  select tag from tags where tags.n = $1
$$;

-------------------------------------------------------------------------------
-- The tag
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.report(r, w) from generate_series(5, 7) r, (values (2), (3), (4)) v(w);
reset role;
insert into tags select n, 'Player #' || alias from generate_series(2, 4) n
  join public.moderation_cases c on c.player = pg_temp.u(n) and c.status = 'open';

select ok((select bool_and(alias between 1000 and 9999) from public.moderation_cases), 'every case has a four-digit tag');
select is((select count(distinct alias)::integer from public.moderation_cases where status = 'open'), 3,
  'three hidden players get three different tags');
select is((select held_name from public.moderation_cases where id = pg_temp.case_of(2)), 'Lima',
  'the case holds the name it hid');
select is((select payload->>'alias' from public.notifications_sent where user_id = pg_temp.u(2) and kind = 'moderation'),
  (select alias::text from public.moderation_cases where id = pg_temp.case_of(2)), 'the under-review note carries the tag');

set local role authenticated;
select is(pg_temp.kilo_sees(2), pg_temp.tag(2), 'others see a hidden player by the tag');
select is(pg_temp.kilo_sees(2), pg_temp.tag(2), 'and the same tag every time');
select results_eq($$select display_name from public.season_leaderboard() where user_id = pg_temp.u(2)$$,
  $$select pg_temp.tag(2)$$, 'on the leaderboard too');
select results_eq($$select display_name from public.league_member_profile((select id from lg), pg_temp.u(2))$$,
  $$select pg_temp.tag(2)$$, 'and on the profile card');

select pg_temp.act(2);
select results_eq($$select hidden, alias::text, renamed from public.my_name_review()$$,
  $$select true, substr(pg_temp.tag(2), 9), false$$, 'the hidden player can see they''re hidden, and their tag');
select is((select display_name from public.league_standings((select id from lg)) where user_id = pg_temp.u(2)), 'Lima',
  'and still sees their own name');

select pg_temp.act(1);
select results_eq($$select hidden, alias, renamed from public.my_name_review()$$,
  $$values (false, null::smallint, false)$$, 'a player with no case isn''t under review');
select throws_ok($$select public.rename_under_review('Kilo_Two')$$, 'P0001', 'Your name isn''t under review.',
  'and can''t use the review rename');

-------------------------------------------------------------------------------
-- The held name
-------------------------------------------------------------------------------

select pg_temp.act(1);
select is(public.display_name_status('lima'), 'taken', 'a held name reads as taken to others');
select throws_ok($$update public.profiles set display_name = 'LIMA' where id = pg_temp.u(1)$$, '23505', null,
  'and nobody else can take it, in any case');

-------------------------------------------------------------------------------
-- Renaming under review
-------------------------------------------------------------------------------

select pg_temp.act(2);
select lives_ok($$select public.rename_under_review('Lima_New')$$, 'the hidden player renames despite the weekly limit');
select is(pg_temp.kilo_sees(2), 'Lima_New', 'others see the new name at once');
select pg_temp.act(2);
select results_eq($$select hidden, renamed from public.my_name_review()$$, $$values (false, true)$$,
  'and the app knows they renamed');
select throws_ok($$update public.profiles set display_name = 'Lima_Third' where id = pg_temp.u(2)$$, 'P0001',
  'You can change your name once a week.', 'a second rename in the case is held to the weekly limit');
select throws_ok($$select public.rename_under_review('Lima_Third')$$, 'P0001', 'Your name isn''t under review.',
  'and the review rename is used up');
select pg_temp.act(1);
select is(public.display_name_status('Lima'), 'taken', 'the held name is still held');

-- An older build renames straight through the table, and gets the same pass.
select pg_temp.act(3);
select lives_ok($$update public.profiles set display_name = 'Mike_New' where id = pg_temp.u(3)$$,
  'a rename from Edit Profile while hidden also skips the limit');
select is(pg_temp.kilo_sees(3), 'Mike_New', 'and shows at once');

-- Enough established reporters reporting the new name hide it again. Each
-- player can only report someone once, so it takes three new reporters.
select pg_temp.report(r, 3) from (values (1), (2), (4)) v(r);
select is(pg_temp.kilo_sees(3), pg_temp.tag(3), 'a new name reported by enough players is hidden again, same tag');
reset role;

-------------------------------------------------------------------------------
-- Dismissed: the held name comes back
-------------------------------------------------------------------------------

-- Run by a moderator in the app, as a player would call it.
create temp table lima_case as select pg_temp.case_of(2) as id;
grant select on lima_case to authenticated;
set local role authenticated;
select pg_temp.act(9);
select lives_ok($$select public.moderate((select id from lima_case), 'dismiss')$$,
  'a moderator dismisses the case from the app');
reset role;

select is((select display_name from public.profiles where id = pg_temp.u(2)), 'Lima', 'the held name comes back');
select is((select name_changed_at from public.profiles where id = pg_temp.u(2)), null,
  'without starting the weekly limit');
select is((select payload->>'name' from public.notifications_sent where user_id = pg_temp.u(2) and kind = 'name_restored'),
  'Lima', 'and they get a note saying so');
select ok(not exists (select 1 from public.retired_names where name_key = 'lima'), 'a dismissed name isn''t retired');

set local role authenticated;
select is(pg_temp.kilo_sees(2), 'Lima', 'everyone sees it again');
select pg_temp.act(1);
select is(public.display_name_status('Lima_New'), 'free', 'and the new name is free for anyone');

select pg_temp.act(2);
select is((select count(*)::integer from public.inbox_items_v3() where kind = 'name_restored'), 1,
  'the note is in this build''s inbox');
select is(public.inbox_unread_count_v3() - public.inbox_unread_count_v2(), 1, 'and counted as unread there');
select is((select count(*)::integer from public.inbox_items_v2() where kind = 'name_restored'), 0,
  'older builds don''t get it');
select is((select count(*)::integer from public.inbox_items() where kind = 'name_restored'), 0, 'or the ones before');
select is((select count(*)::integer from public.my_notifications() where kind = 'name_restored'), 0, 'or the oldest');
select is(public.inbox_unread_count(), public.inbox_unread_count_v2(), 'and the older unread counts leave it out');
select is(public.unread_notification_count(), public.inbox_unread_count_v2(), 'all of them');
select lives_ok($$update public.profiles set display_name = 'Lima_Again' where id = pg_temp.u(2)$$,
  'they can change it again straight away');
reset role;

-------------------------------------------------------------------------------
-- Actioned: the held name is retired
-------------------------------------------------------------------------------

-- Mike renames again, to a name nobody has reported: a reset keeps it.
update public.profiles set display_name = 'Mike_Fresh' where id = pg_temp.u(3);
select public.moderate(pg_temp.case_of(3), 'reset_name');
select is((select display_name from public.profiles where id = pg_temp.u(3)), 'Mike_Fresh',
  'a reset after a rename keeps the new name');
select is((select payload->>'kept' from public.notifications_sent
  where user_id = pg_temp.u(3) and kind = 'moderation' and payload->>'action' = 'reset_name'), 'true',
  'and the note says the new name stays');
select ok(exists (select 1 from public.retired_names where name_key = 'mike'), 'the held name is retired');

set local role authenticated;
select pg_temp.act(1);
select is(public.display_name_status('MIKE'), 'blocked', 'a retired name reads as not allowed');
select throws_ok($$update public.profiles set display_name = 'Mike' where id = pg_temp.u(1)$$, 'P0001',
  'That name isn''t allowed.', 'and nobody can take it');
select pg_temp.act(3);
select is(public.display_name_status('Mike'), 'blocked', 'its old owner included');
select is(pg_temp.kilo_sees(3), 'Mike_Fresh', 'and the case is closed, so the new name shows');
reset role;

-- Nova never renamed: a reset clears the name as before, and retires it.
select public.moderate(pg_temp.case_of(4), 'reset_name');
select is((select display_name from public.profiles where id = pg_temp.u(4)), null,
  'a reset without a rename clears the name');
select ok(exists (select 1 from public.retired_names where name_key = 'nova'), 'and retires it');
select is((select payload->>'kept' from public.notifications_sent
  where user_id = pg_temp.u(4) and kind = 'moderation' and payload->>'action' = 'reset_name'), null,
  'with the usual note');

-------------------------------------------------------------------------------
-- A new case, and former members
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.report(8, 2);
reset role;
select isnt('Player #' || (select alias from public.moderation_cases where id = pg_temp.case_of(2)), pg_temp.tag(2),
  'a new case gets a new tag');

update public.profiles set deleted_at = now(), display_name = null where id = pg_temp.u(8);
set local role authenticated;
select matches(pg_temp.kilo_sees(8), '^Former Member #[1-9][0-9]{3}$', 'a deleted account with no case is tagged too');
select is(pg_temp.kilo_sees(8), pg_temp.kilo_sees(8), 'with the same tag every time');
reset role;

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act(1);
select throws_ok($$select * from public.retired_names$$, '42501', null, 'players can''t read retired names');
select throws_ok($$select public.hidden_name(pg_temp.u(2))$$, '42501', null, 'or look up a hidden player''s tag');
reset role;
set local role anon;
select throws_ok($$select public.rename_under_review('Anon_Name')$$, '42501', null, 'signed-out callers can''t rename');
reset role;

select * from finish();
rollback;
