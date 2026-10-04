-- Name guard: one change a week (the first name is free), name history,
-- reports, owner resets, and that deleting an account clears all of it.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- The real blocked list is not in the repository; one made-up term stands in.
delete from public.blocked_name_terms;
insert into public.blocked_name_terms (term, match) values ('badword', 'contains');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'ana@example.test'),
  ('00000000-0000-0000-0000-0000000000b7', 'ben@example.test');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.history(player uuid) returns text[] language sql as $$
  select coalesce(array_agg(display_name order by changed_at, display_name), '{}') from public.display_name_history where user_id = player
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');

update public.profiles set display_name = 'First_Name' where id = '00000000-0000-0000-0000-0000000000a7';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a7'), 'First_Name',
  'the first name is always allowed');
select isnt((select name_changed_at from public.profiles where id = '00000000-0000-0000-0000-0000000000a7'), null,
  'setting a name starts the clock');

select throws_ok(
  $$update public.profiles set display_name = 'Second_Name' where id = '00000000-0000-0000-0000-0000000000a7'$$,
  'P0001', 'You can change your name once a week.',
  'a second change within the week is refused'
);

-- A week later.
reset role;
update public.profiles set name_changed_at = now() - interval '8 days' where id = '00000000-0000-0000-0000-0000000000a7';
set local role authenticated;
select lives_ok(
  $$update public.profiles set display_name = 'Second_Name' where id = '00000000-0000-0000-0000-0000000000a7'$$,
  'a change after a week is allowed'
);
reset role;
select is(pg_temp.history('00000000-0000-0000-0000-0000000000a7'), array['First_Name'], 'the old name is kept');

-- The owner resets it.
select public.reset_display_name('00000000-0000-0000-0000-0000000000a7');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a7'), null,
  'a reset clears the name');
select is(pg_temp.history('00000000-0000-0000-0000-0000000000a7'), array['First_Name', 'Second_Name'],
  'the reset name is kept in the history');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select throws_ok(
  $$update public.profiles set display_name = 'Badword_Fan' where id = '00000000-0000-0000-0000-0000000000a7'$$,
  'P0001', 'That name isn''t allowed.',
  'after a reset, a blocked name is still refused'
);
select lives_ok(
  $$update public.profiles set display_name = 'Third_Name' where id = '00000000-0000-0000-0000-0000000000a7'$$,
  'after a reset, a new name is allowed straight away'
);

-- Reports.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b7');
select public.report_display_name('00000000-0000-0000-0000-0000000000a7', 'offensive');
select public.report_display_name('00000000-0000-0000-0000-0000000000a7', 'still offensive');
select throws_ok(
  $$select public.report_display_name('00000000-0000-0000-0000-0000000000b7')$$,
  'P0001', 'You can''t report yourself.',
  'players cannot report themselves'
);
select throws_ok($$select * from public.name_reports$$, '42501', null, 'players cannot read reports');
select throws_ok($$select * from public.display_name_history$$, '42501', null, 'players cannot read name history');
select throws_ok($$select public.reset_display_name('00000000-0000-0000-0000-0000000000a7')$$, '42501', null,
  'players cannot reset names');
reset role;

select results_eq(
  $$select current_name, reports, reporters, reported_names from public.reported_names$$,
  $$values ('Third_Name', 1::bigint, 1::bigint, array['Third_Name'])$$,
  'repeat reports of the same name count once'
);

set local role anon;
select throws_ok($$select public.report_display_name('00000000-0000-0000-0000-0000000000a7')$$, '42501', null,
  'signed-out callers cannot report');
reset role;

-- Deleting the account clears its past names and the reports against it.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.delete_account();
reset role;
select is(pg_temp.history('00000000-0000-0000-0000-0000000000a7'), '{}'::text[], 'a deleted account''s name history is gone');
select is((select count(*)::int from public.name_reports where reported_id = '00000000-0000-0000-0000-0000000000a7'), 0,
  'so are the reports against it');

select * from finish();
rollback;
