-- Blocked display names: lookalike letters. A `contains` or `word` term spelt
-- with letters that look or sound like the real ones is still blocked, a term
-- that folding would shrink to a few letters isn't widened, and the other
-- modes are unchanged.
--
-- The real list is not in the repository; these are made-up terms.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

delete from public.blocked_name_terms;
insert into public.blocked_name_terms (term, match) values
  ('fiztwick', 'contains'),  -- folds to 7 letters: matched loosely
  ('skrunt', 'contains'),    -- has a "u", for "v" written instead
  ('kilil', 'contains'),     -- folds to 2 letters: strict only
  ('zikor', 'word'),         -- folds to 5 letters: matched loosely, whole part only
  ('zub', 'word'),           -- 3 letters: strict only
  ('lyj', 'word'),           -- folds to 1 letter: strict only
  ('zorp', 'group'),
  ('smash', 'hostile'),
  ('staff', 'name');

-- Each lookalike: j, l and y for i, vv for w, ph for f, c, q and ck for k,
-- z for s, v for u. Squeezing runs after folding, so mixed runs collapse too.
select ok(public.display_name_blocked(n), n || ' is blocked') from unnest(array[
  'FjztVVick', 'phiztwiq', 'FIZTWIK', 'fyzzt_wikk', 'fIstwlck', 'xx_Fistwik_xx', 'Ph1stw1kk',
  'zkrvnt', 'SkrVnt', 'big_skrunt',
  'Zyckor', 'zikkor_99', 'king_sicor', 'S1k0r', 'Ziqor'
]) n;

-- Not blocked: a term inside an ordinary word stays a `word` term's whole-part
-- rule, and terms that are short or fold too short only match as written.
select ok(not public.display_name_blocked(n), n || ' is allowed') from unnest(array[
  'Zikorzak', 'Sickle', 'Quick_Jab', 'Kylie_Fan', 'Kjljl', 'Lee_Yi', 'Jill', 'Iyj',
  'Zvb', 'Sub_Fan', 'Elite_Striker', 'Pho_King'
]) n;

-- The strict match still runs, so short terms are blocked as before.
select ok(public.display_name_blocked(n), n || ' is still blocked as written') from unnest(array[
  'K1l1l', 'lyj', 'team_lyj', 'zub'
]) n;

-- Pair and reserved terms are not folded.
select ok(not public.display_name_blocked('Zorpsmazh'), 'pair terms are not folded');
select ok(public.display_name_blocked('Zorpsmash'), 'pair terms still match as before');
select ok(not public.display_name_blocked('Ztaff'), 'reserved names are not folded');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'hal@example.test');
create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select is(public.display_name_status('FjztVVick'), 'blocked', 'onboarding shows a lookalike name as blocked');
select ok(not public.display_name_available('Zyckor'), 'installed builds see it as unavailable');
select throws_ok(
  $$update public.profiles set display_name = 'zikkor_99' where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'P0001', 'That name isn''t allowed.',
  'saving a lookalike name fails with the usual message'
);
select throws_ok($$select public.normalize_handle_loose('x')$$, '42501', null, 'players cannot call the folding');
reset role;

-- A name saved before the folding existed stays until the list is reloaded:
-- the dry run lists it, and loading clears it.
delete from public.blocked_name_terms;
update public.profiles set display_name = 'FjztVVick' where id = '00000000-0000-0000-0000-0000000000f1';
select results_eq(
  $$select kind, name from public.preview_blocked_names('[{"term": "fiztwick", "match": "contains"}]')$$,
  $$values ('player', 'FjztVVick')$$,
  'the dry run lists a current name the folding catches'
);
select is(public.replace_blocked_names('[{"term": "fiztwick", "match": "contains"}]'), 1,
  'loading the list clears it');

select * from finish();
rollback;
