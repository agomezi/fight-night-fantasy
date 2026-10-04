-- Display names: the handle rule, uniqueness ignoring case, the availability
-- check, and that players can only set their own.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dana@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'eli@example.test');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), null,
  'a new account starts with no name');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');

select ok(public.display_name_available('Elite_Striker'), 'an unused handle is available');
select ok(not public.display_name_available('ab'), 'two characters is too short');
select ok(not public.display_name_available('a_very_long_handle_21'), 'twenty-one characters is too long');
select ok(not public.display_name_available('has space'), 'spaces are not allowed');
select ok(not public.display_name_available('emoji🥊'), 'only letters, digits and underscores are allowed');

select throws_ok(
  $$update public.profiles set display_name = 'no spaces' where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '23514', null,
  'a name breaking the rule is refused'
);

update public.profiles set display_name = 'Elite_Striker' where id = '00000000-0000-0000-0000-0000000000d1';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 'Elite_Striker',
  'a player can set their own name');
select ok(public.display_name_available('elite_striker'), 'your own name, in any case, counts as free to you');


-- Someone else.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select ok(not public.display_name_available('ELITE_STRIKER'), 'a taken name is unavailable in any case');
select throws_ok(
  $$update public.profiles set display_name = 'ELITE_STRIKER' where id = '00000000-0000-0000-0000-0000000000d2'$$,
  '23505', null,
  'a taken name is refused in any case'
);
update public.profiles set display_name = 'Lights_Out' where id = '00000000-0000-0000-0000-0000000000d2';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d2'), 'Lights_Out',
  'a different name is fine');

-- Players cannot rename anyone else.
update public.profiles set display_name = 'Hijacked' where id = '00000000-0000-0000-0000-0000000000d1';
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 'Elite_Striker',
  'another player''s name cannot be changed');

-- Deleting an account frees its handle.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select public.delete_account();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select ok(public.display_name_available('Elite_Striker'), 'a deleted account''s name is free again');
reset role;

set local role anon;
select throws_ok($$select public.display_name_available('anything')$$, '42501', null, 'signed-out callers cannot probe names');
reset role;

select is(
  (select count(*)::int from pg_indexes where indexname = 'profiles_display_name_unique'),
  1,
  'the case-insensitive unique index exists'
);

select * from finish();
rollback;
