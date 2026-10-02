-- Fighter photos: set once from a confident match, never overwritten by the
-- sync, never two fighters on one API-Sports id. Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
reset role;

select ok(not has_function_privilege('authenticated', 'public.set_fighter_photos(jsonb)', 'execute'), 'users cannot set photos');

select * from finish();
rollback;
