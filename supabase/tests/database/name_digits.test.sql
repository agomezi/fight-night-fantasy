-- Blocked display names: a 9 written for a "g" and a 2 for a "z" no longer
-- slip a term through, in both the strict and the lookalike match.
--
-- The real list is not in the repository; these are made-up terms.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

delete from public.blocked_name_terms;
insert into public.blocked_name_terms (term, match) values
  ('blogger', 'contains'),  -- strict: 9s for the g's
  ('zwomp', 'word'),        -- strict: 2 for the z
  ('grimtrok', 'contains'); -- loose: 9 for g with a lookalike letter

select is(public.normalize_handle('x9y2'), 'xgyz', '9 reads as g and 2 as z');
select ok(public.display_name_blocked('blo99er_x'), '9s for g are blocked');
select ok(public.display_name_blocked('BL0G9ER'), 'a mix of 6-style and 9 digits is blocked');
select ok(public.display_name_blocked('big_2womp'), '2 for z is blocked as a whole word');
select ok(public.display_name_blocked('9rimtroq'), 'a 9 still counts after lookalike folding');
select ok(not public.display_name_blocked('mike_99'), 'an ordinary name with 9s is allowed');
select ok(not public.display_name_blocked('team2'), 'an ordinary name with a 2 is allowed');

set local role authenticated;
select is(public.display_name_status('blo99er'), 'blocked', 'onboarding shows it as blocked');
select ok(not public.display_name_available('blo99er'), 'installed builds see it as unavailable');

select * from finish();
rollback;
