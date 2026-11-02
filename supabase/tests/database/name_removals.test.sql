-- Removed names: a name cleared on the server is recorded and counted, a new
-- name clears the record but not the count, and neither a deleted account
-- nor a player emptying their own name counts. Players read only their own.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- The real blocked list is not in the repository; one made-up term stands in.
delete from public.blocked_name_terms;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c8', 'cy@example.test'),
  ('00000000-0000-0000-0000-0000000000d8', 'di@example.test'),
  ('00000000-0000-0000-0000-0000000000e8', 'ed@example.test');
update public.profiles set display_name = 'Grubwick_Fan' where id = '00000000-0000-0000-0000-0000000000c8';
update public.profiles set display_name = 'Dee_Dee' where id = '00000000-0000-0000-0000-0000000000d8';
update public.profiles set display_name = 'Eddie_E' where id = '00000000-0000-0000-0000-0000000000e8';

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.removal(player uuid) returns table (removed boolean, times integer) language sql as $$
  select name_removed_at is not null, names_removed from public.profiles where id = player
$$;

select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000c8')$$, $$values (false, 0)$$,
  'a named player has no removals');

-- Loading a list that blocks the name clears it and records the removal.
select is(public.replace_blocked_names('[{"term": "grubwick", "match": "contains"}]'), 1, 'the list clears the name');
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000c8')$$, $$values (true, 1)$$,
  'a name cleared by the list is recorded and counted');

-- The player picks a new one: the record goes, the count stays.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c8');
select results_eq(
  $$select name_removed_at is not null, names_removed from public.profiles where id = '00000000-0000-0000-0000-0000000000c8'$$,
  $$values (true, 1)$$,
  'the player reads their own removal'
);
select is((select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-0000000000d8'), 0,
  'nobody else''s profile row is readable');
update public.profiles set display_name = 'Clean_Name' where id = '00000000-0000-0000-0000-0000000000c8';
select results_eq($$select name_removed_at is not null, names_removed from public.profiles where id = '00000000-0000-0000-0000-0000000000c8'$$,
  $$values (false, 1)$$, 'a new name clears the record and keeps the count');
select throws_ok(
  $$update public.profiles set names_removed = 0 where id = '00000000-0000-0000-0000-0000000000c8'$$,
  '42501', null, 'players cannot reset their count'
);
select throws_ok(
  $$update public.profiles set name_removed_at = null where id = '00000000-0000-0000-0000-0000000000c8'$$,
  '42501', null, 'players cannot clear their record'
);
select throws_ok($$select * from public.name_removals$$, '42501', null, 'players cannot read the removals list');
reset role;

-- The owner's reset counts too.
select public.reset_display_name('00000000-0000-0000-0000-0000000000c8');
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000c8')$$, $$values (true, 2)$$,
  'an owner reset is recorded and counted');
select results_eq(
  $$select player, names_removed, waiting_since is not null, past_names from public.name_removals$$,
  $$values ('00000000-0000-0000-0000-0000000000c8'::uuid, 2, true, array['Clean_Name', 'Grubwick_Fan'])$$,
  'the owner sees who has had names removed, how often, and their past names'
);

-- Clearing a name that's already empty changes nothing.
update public.profiles set display_name = null where id = '00000000-0000-0000-0000-0000000000c8';
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000c8')$$, $$values (true, 2)$$,
  'clearing an empty name isn''t another removal');

-- Deleting an account isn't a removal.
update public.profiles set display_name = null, deleted_at = now() where id = '00000000-0000-0000-0000-0000000000d8';
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000d8')$$, $$values (false, 0)$$,
  'a deleted account isn''t counted');

-- A player emptying their own name isn't a removal either (a week after
-- naming themselves, so the weekly limit doesn't stop it).
update public.profiles set name_changed_at = now() - interval '8 days' where id = '00000000-0000-0000-0000-0000000000e8';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e8');
update public.profiles set display_name = null where id = '00000000-0000-0000-0000-0000000000e8';
reset role;
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000e8')$$, $$values (false, 0)$$,
  'a player emptying their own name isn''t counted');

-- A moderator's reset runs as a player but still counts.
-- The name was chosen just now, so the weekly limit would refuse a player.
update public.profiles set display_name = 'Eddie_Two' where id = '00000000-0000-0000-0000-0000000000e8';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e8');
create function pg_temp.as_moderator_reset() returns void language sql security definer as $$
  select public.reset_display_name('00000000-0000-0000-0000-0000000000e8')
$$;
reset role;
alter function pg_temp.as_moderator_reset() owner to postgres;
set local role authenticated;
select pg_temp.as_moderator_reset();
reset role;
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000e8')$$, $$values (true, 1)$$,
  'a reset run from a player''s session (a moderator) goes through the weekly limit and is counted');

-- Any other clear on the server isn't a removal.
update public.profiles set display_name = 'Dee_Two' where id = '00000000-0000-0000-0000-0000000000c8';
update public.profiles set display_name = null where id = '00000000-0000-0000-0000-0000000000c8';
select results_eq($$select * from pg_temp.removal('00000000-0000-0000-0000-0000000000c8')$$, $$values (false, 2)$$,
  'a plain clear on the server isn''t a removal');

-- Deleted accounts drop out of the owner's list.
select is((select count(*)::integer from public.name_removals where player = '00000000-0000-0000-0000-0000000000d8'), 0,
  'a deleted account isn''t listed');

-- Players cannot run the trigger function directly.
set local role authenticated;
select throws_ok($$select public.track_name_removal()$$, null, null, 'players cannot call the trigger function');
reset role;
select has_column('public', 'profiles', 'names_removed', 'the count is on the profile');

select * from finish();
rollback;
