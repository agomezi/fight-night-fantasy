-- Fighter records and measurements, from the card feed.
--
-- The feed carries each fighter's record (W-L-D, no contests), date of birth,
-- height, reach and stance. Card sync keeps them current, so the picks screen
-- can show a record under each name and a fighter profile has something to
-- show. A sync that has no record for a fighter leaves what is stored alone.

alter table public.fighters
  add column wins        smallint check (wins >= 0),
  add column losses      smallint check (losses >= 0),
  add column draws       smallint check (draws >= 0),
  add column no_contests smallint check (no_contests >= 0),
  add column dob         date,
  add column height_in   numeric(4, 1) check (height_in > 0),
  add column reach_in    numeric(4, 1) check (reach_in > 0),
  add column stance      text;

-- As before, also keeping the profile current when the card brings one.
create or replace function public.upsert_fighter(fighter jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  fighter_id uuid;
  p jsonb := fighter->'profile';
begin
  insert into public.fighters
    (ufc_fighter_id, name, nickname, wins, losses, draws, no_contests, dob, height_in, reach_in, stance)
  values (
    fighter->>'ufcFighterId', fighter->>'name', fighter->>'nickname',
    (p->>'wins')::smallint, (p->>'losses')::smallint, (p->>'draws')::smallint, (p->>'noContests')::smallint,
    (p->>'dob')::date, (p->>'heightIn')::numeric, (p->>'reachIn')::numeric, p->>'stance'
  )
  on conflict (ufc_fighter_id) do update
    set name        = excluded.name,
        nickname    = excluded.nickname,
        wins        = coalesce(excluded.wins, fighters.wins),
        losses      = coalesce(excluded.losses, fighters.losses),
        draws       = coalesce(excluded.draws, fighters.draws),
        no_contests = coalesce(excluded.no_contests, fighters.no_contests),
        dob         = coalesce(excluded.dob, fighters.dob),
        height_in   = coalesce(excluded.height_in, fighters.height_in),
        reach_in    = coalesce(excluded.reach_in, fighters.reach_in),
        stance      = coalesce(excluded.stance, fighters.stance)
    where (fighters.name, fighters.nickname) is distinct from (excluded.name, excluded.nickname)
       or (p is not null and (fighters.wins, fighters.losses, fighters.draws, fighters.no_contests,
                              fighters.dob, fighters.height_in, fighters.reach_in, fighters.stance)
           is distinct from (excluded.wins, excluded.losses, excluded.draws, excluded.no_contests,
                             excluded.dob, excluded.height_in, excluded.reach_in, excluded.stance))
  returning id into fighter_id;

  -- An unchanged fighter skips the update, and with it the returned row.
  if fighter_id is null then
    select id into fighter_id from public.fighters where ufc_fighter_id = fighter->>'ufcFighterId';
  end if;
  return fighter_id;
end;
$$;
