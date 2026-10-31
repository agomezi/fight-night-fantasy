-- Blocked display names: roots and allowed words. A `root` term is blocked
-- anywhere in a name, with any spelling built on it, except inside an `allow`
-- word; allowed words never block, and the other modes ignore them.
--
-- The real list is not in the repository; these are made-up terms.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

delete from public.blocked_name_terms;
insert into public.blocked_name_terms (term, match) values
  ('zud', 'root'),           -- 3 letters: strict only
  ('zork', 'root'),          -- 4 letters: matched loosely too
  ('bazudo', 'allow'),
  ('zorkshire', 'allow'),
  ('plimp', 'allow'),        -- has no root in it: does nothing
  ('quorb', 'contains'),
  ('quorbit', 'allow');

-- A root with anything around it, disguised or not.
select ok(public.display_name_blocked(n), n || ' is blocked') from unnest(array[
  'zud', 'Zuddy', 'zudie_99', 'big_zudah', 'Z_U_D', 'ZUUUD', 'my_zud',
  'zork', 'Zorky', 'x_z0rkah_x', 'Sorq', 'zorkshire_zork'
]) n;

-- Allowed words, however they're written, and names with no root.
select ok(not public.display_name_blocked(n), n || ' is allowed') from unnest(array[
  'bazudo', 'BaZuddo', 'Team_Bazudo_7', 'Zorkshire_Fan', 'Sorkshire_Fan', 'zorkshirebazudo', 'plimp', 'Zebu_Dog'
]) n;

-- An allowed word becomes a separator, so the letters either side of it
-- don't join up into a root.
select ok(not public.display_name_blocked('zu_bazudo_d'), 'letters either side of an allowed word stay apart');

-- A root across an underscore counts from the start of a part only, so a
-- word ending in its first letters next to one starting with the rest is fine.
select ok(public.display_name_blocked(n), n || ' is blocked across parts') from unnest(array[
  'zu_ddy', 'Zu_Die', 'x_zu_d', 'z_u_d_y'
]) n;
select ok(not public.display_name_blocked(n), n || ' is allowed across parts') from unnest(array[
  'Kazu_Dean', 'kazu_d', 'Vinz_Orka'
]) n;

-- The trade-off: letters in front of a root before an underscore hide it.
select ok(not public.display_name_blocked('azu_ddy'), 'letters before a root in the same part hide it across an underscore');

-- Empty and letterless names, and other modes with allowed words loaded.
select ok(not public.display_name_blocked(n), coalesce(n, 'null') || ' is not blocked') from unnest(array[
  null, '', '___', '222'
]::text[]) n;
insert into public.blocked_name_terms (term, match) values ('glim', 'word'), ('bazudoglim', 'allow');
select ok(public.display_name_blocked('my_glim'), 'a word term is still blocked with allowed words loaded');
delete from public.blocked_name_terms where term in ('glim', 'bazudoglim');

-- `contains` terms don't look at allowed words.
select ok(public.display_name_blocked('quorbit'), 'a contains term is blocked inside an allowed word');

-- Without allowed words a root is blocked everywhere.
delete from public.blocked_name_terms where match = 'allow';
select ok(public.display_name_blocked('Zorkshire_Fan'), 'with no allowed words, a root inside any word is blocked');
insert into public.blocked_name_terms (term, match) values ('bazudo', 'allow'), ('zorkshire', 'allow');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'ira@example.test');
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select is(public.display_name_status('Zuddy'), 'blocked', 'onboarding shows a root name as blocked');
select isnt(public.display_name_status('Bazudo'), 'blocked', 'onboarding lets an allowed word through');
select throws_ok(
  $$update public.profiles set display_name = 'zudie_99' where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'P0001', 'That name isn''t allowed.',
  'saving a root name fails with the usual message'
);
select throws_ok($$select public.name_has_blocked_root('x')$$, '42501', null, 'players cannot call the root match');
reset role;

select throws_ok(
  $$insert into public.blocked_name_terms (term, match) values ('zap', 'nope')$$,
  '23514', null, 'an unknown mode is still refused'
);

-- A name saved before the root was listed stays until the list is reloaded:
-- the dry run lists it, and loading clears it but not the allowed word.
delete from public.blocked_name_terms;
update public.profiles set display_name = 'Zuddy' where id = '00000000-0000-0000-0000-0000000000f2';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'jo@example.test');
update public.profiles set display_name = 'Bazudo' where id = '00000000-0000-0000-0000-0000000000f3';
select results_eq(
  $$select kind, name from public.preview_blocked_names('[{"term": "zud", "match": "root"}, {"term": "bazudo", "match": "allow"}]')$$,
  $$values ('player', 'Zuddy')$$,
  'the dry run lists a current name a root catches, and not an allowed one'
);
select is(public.replace_blocked_names('[{"term": "zud", "match": "root"}, {"term": "bazudo", "match": "allow"}]'), 1,
  'loading the list clears it');

select * from finish();
rollback;
