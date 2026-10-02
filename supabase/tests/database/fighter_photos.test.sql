-- Fighter photos: set once from a confident match, never overwritten by the
-- sync, never two fighters on one API-Sports id. Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.fighters (ufc_fighter_id, name) values ('1', 'Natalia Silva'), ('2', 'Wang Cong'), ('3', 'Bruno Silva');

-- Runs as ingestion does, under service_role's own grants.
set local role service_role;

select is(
  public.set_fighter_photos('[
    {"ufcFighterId": "1", "apisportsFighterId": 11, "photoUrl": "https://media.api-sports.io/mma/fighters/11.png"},
    {"ufcFighterId": "2", "apisportsFighterId": 12, "photoUrl": "https://media.api-sports.io/mma/fighters/12.png"}
  ]'::jsonb),
  2, 'matched fighters get their photo'
);
select results_eq(
  $$select apisports_fighter_id, photo_url from public.fighters where ufc_fighter_id = '1'$$,
  $$values (11, 'https://media.api-sports.io/mma/fighters/11.png')$$,
  'with their API-Sports id'
);

select is(
  public.set_fighter_photos('[{"ufcFighterId": "1", "apisportsFighterId": 99, "photoUrl": "https://example.test/other.png"}]'::jsonb),
  0, 'a matched fighter is not re-matched'
);
select is((select photo_url from public.fighters where ufc_fighter_id = '1'),
  'https://media.api-sports.io/mma/fighters/11.png', 'so the photo is unchanged');

select is(
  public.set_fighter_photos('[{"ufcFighterId": "3", "apisportsFighterId": 11, "photoUrl": "https://media.api-sports.io/mma/fighters/11.png"}]'::jsonb),
  0, 'an id another fighter holds is skipped'
);
select is((select photo_url from public.fighters where ufc_fighter_id = '3'), null, 'leaving that fighter without a photo');

select is(
  public.set_fighter_photos('[{"ufcFighterId": "3", "apisportsFighterId": 31, "photoUrl": "http://insecure.example/31.png"}]'::jsonb),
  0, 'a non-https photo is refused'
);
select is(
  public.set_fighter_photos('[{"ufcFighterId": "unknown", "apisportsFighterId": 41, "photoUrl": "https://example.test/41.png"}]'::jsonb),
  0, 'an unknown fighter changes nothing'
);

-- A fighter searched for without a match is marked, so runs skip them for a while.
select is(public.mark_photo_checked(array['3', '1']), 1, 'only fighters still without a photo are marked');
select ok((select photo_checked_at is not null from public.fighters where ufc_fighter_id = '3'), 'the unmatched fighter is marked');

-- A stored API-Sports photo that no longer loads is cleared; a manual one is not.
reset role;
update public.fighters set photo_url = 'https://example.test/by-hand.png' where ufc_fighter_id = '2';
set local role service_role;
select is(public.clear_broken_photos(array['1', '2']), 1, 'only the sync''s own broken photo is cleared');
select results_eq(
  $$select photo_url, apisports_fighter_id, photo_checked_at is not null from public.fighters where ufc_fighter_id = '1'$$,
  $$values (null::text, null::integer, true)$$,
  'it is emptied and marked checked, to be looked for again in a week'
);
select is((select photo_url from public.fighters where ufc_fighter_id = '2'), 'https://example.test/by-hand.png', 'a photo set by hand is kept');
reset role;

select ok(not has_function_privilege('authenticated', 'public.set_fighter_photos(jsonb)', 'execute'), 'users cannot set photos');
select ok(not has_function_privilege('authenticated', 'public.clear_broken_photos(text[])', 'execute'), 'users cannot clear photos');
select ok(not has_function_privilege('authenticated', 'public.mark_photo_checked(text[])', 'execute'), 'users cannot mark fighters');

select * from finish();
rollback;
