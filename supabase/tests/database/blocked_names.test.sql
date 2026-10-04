-- Blocked display names: disguised terms are caught, ordinary names that only
-- contain a short term are not, saving a blocked name fails with a clear
-- message, and the list itself is not readable by players.
--
-- The real list is not in the repository, so these tests load made-up terms
-- of each kind and check the matching rules against them.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

delete from public.blocked_name_terms;
insert into public.blocked_name_terms (term, match) values
  ('badword', 'contains'),  -- no innocent use: blocked anywhere
  ('zap', 'word'),          -- short: only as a whole word
  ('modbot', 'name');       -- reserved: only as the whole name

-- Blocked, including the usual disguises.
select ok(public.display_name_blocked(n), n || ' is blocked') from unnest(array[
  'badword', 'B4dW0rd_99', 'b_a_d_w_o_r_d', 'baaadwoord', 'xxBADWORDxx',
  'zap', 'Zap_King', 'king_z4p',
  'ModBot', 'modbot1', 'Mod_Bot'
]) n;

-- Allowed: a short term inside an ordinary word, a reserved name inside a
-- longer handle, and names with nothing to do with any of it.
select ok(not public.display_name_blocked(n), n || ' is allowed') from unnest(array[
  'Zapper', 'Pizzazap', 'ModBot_Fan', 'Elite_Striker', 'Soggy_Toes69', 'Bad_Wolf'
]) n;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'frank@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2', 'gus@example.test');
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');

select results_eq(
  $$select public.display_name_status(n) from unnest(array['ab', 'B4dW0rd_99', 'Elite_Striker']) n$$,
  $$values ('invalid'), ('blocked'), ('free')$$,
  'the status says why a name cannot be used'
);
select ok(not public.display_name_available('B4dW0rd_99'), 'installed builds see a blocked name as unavailable');

select throws_ok(
  $$update public.profiles set display_name = 'Zap_King' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'P0001', 'That name isn''t allowed.',
  'saving a blocked name fails with a message the app can show'
);

update public.profiles set display_name = 'Elite_Striker' where id = '00000000-0000-0000-0000-0000000000e1';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'Elite_Striker',
  'an allowed name saves');

select throws_ok($$select * from public.blocked_name_terms$$, '42501', null, 'players cannot read the list');
select throws_ok($$select public.clear_blocked_names()$$, '42501', null, 'players cannot run the cleanup');
reset role;

-- A name that was fine becomes blocked when the list grows; the cleanup
-- clears it.
update public.profiles set display_name = 'Wolfpack' where id = '00000000-0000-0000-0000-0000000000e2';
insert into public.blocked_name_terms (term, match) values ('wolfpack', 'contains');
select is(public.clear_blocked_names(), 1, 'the cleanup clears names the list now blocks');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e2'), null,
  'that player picks a new name next time');

-- The loader replaces the whole list in one call.
select is(public.replace_blocked_names('[{"term": "newterm", "match": "contains"}]'), 0,
  'replacing the list reports how many names it cleared');
select results_eq($$select term, match from public.blocked_name_terms$$, $$values ('newterm', 'contains')$$,
  'the old list is gone and the new one is in');

select * from finish();
rollback;
