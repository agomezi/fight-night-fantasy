-- Casual points beside the full ones.
--
-- Casual leagues play half deductions, and with them half the wrong-fighter
-- earnings, so a pick scores differently there. Every other tier scores a bout
-- the same and differs only in the season ledger (floor and debt), which league
-- standings replay from these rows. Storing Casual's number keeps scoring the
-- one place the rulebook lives.

alter table public.scores add column casual_points integer;

-- Existing rows are rebuilt from their breakdown. A line earned with the
-- fighter wrong is half credit (25 / 12), which Casual halves again (12 / 6);
-- deductions halve rounding down. A pick is positive at either tier exactly
-- when the fighter is right, so the underdog bonus applies to the same rows.
with lines as (
  select user_id, bout_id, correct,
         (breakdown->>'underdogBonus')::integer > 0 as underdog,
         case when correct then 50 else -25 end as fighter,
         case
           when (breakdown->>'method')::integer < 0 then -15
           when (breakdown->>'method')::integer = 0 then 0
           when correct then 50
           else 12
         end as method,
         case
           when (breakdown->>'round')::integer < 0 then -7
           when (breakdown->>'round')::integer = 0 then 0
           when correct then 25
           else 6
         end as round
  from public.scores
  where counts_for_accuracy
)
update public.scores s
   set casual_points = case
         when l.underdog then floor((l.fighter + l.method + l.round) * 1.5)::integer
         else l.fighter + l.method + l.round
       end
  from lines l
 where s.user_id = l.user_id and s.bout_id = l.bout_id;

-- A void or unpicked bout scores 0 at every tier.
update public.scores set casual_points = points where casual_points is null;

alter table public.scores alter column casual_points set not null;

-------------------------------------------------------------------------------
-- Writing scores
-------------------------------------------------------------------------------

-- As before, with `casual_points` carried through. A results sync deployed
-- before this migration sends none; those rows fall back to the full points
-- and are rewritten correctly on the next run after the sync is redeployed.
create or replace function public.replace_event_scores(event_id uuid, score_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  season    uuid;
  n_written integer;
  n_removed integer;
begin
  select e.season_id into season from public.events e where e.id = event_id;
  if not found then
    raise exception 'event % is not stored', event_id;
  end if;

  create temporary table incoming on commit drop as
  select
    (x->>'user_id')::uuid             as user_id,
    (x->>'bout_id')::uuid             as bout_id,
    (x->>'points')::integer           as points,
    coalesce((x->>'casual_points')::integer, (x->>'points')::integer) as casual_points,
    x->'breakdown'                    as breakdown,
    (x->>'correct')::boolean          as correct,
    (x->>'counts_for_accuracy')::boolean as counts_for_accuracy,
    (x->>'provisional')::boolean      as provisional
  from jsonb_array_elements(score_rows) x;

  if exists (
    select 1 from incoming i
    left join public.bouts b on b.id = i.bout_id
    where b.event_id is distinct from replace_event_scores.event_id
  ) then
    raise exception 'scores include bouts outside event %', event_id;
  end if;

  delete from public.scores s
  using public.bouts b
  where b.id = s.bout_id
    and b.event_id = replace_event_scores.event_id
    and not exists (select 1 from incoming i where i.user_id = s.user_id and i.bout_id = s.bout_id);
  get diagnostics n_removed = row_count;

  insert into public.scores as s
    (user_id, bout_id, season_id, points, casual_points, breakdown, correct, counts_for_accuracy, provisional)
  select user_id, bout_id, season, points, casual_points, breakdown, correct, counts_for_accuracy, provisional
  from incoming
  on conflict (user_id, bout_id) do update set
    season_id           = excluded.season_id,
    points              = excluded.points,
    casual_points       = excluded.casual_points,
    breakdown           = excluded.breakdown,
    correct             = excluded.correct,
    counts_for_accuracy = excluded.counts_for_accuracy,
    provisional         = excluded.provisional,
    computed_at         = now()
  where (s.season_id, s.points, s.casual_points, s.breakdown, s.correct, s.counts_for_accuracy, s.provisional)
    is distinct from
        (excluded.season_id, excluded.points, excluded.casual_points, excluded.breakdown, excluded.correct,
         excluded.counts_for_accuracy, excluded.provisional);
  get diagnostics n_written = row_count;

  drop table incoming;
  return jsonb_build_object('written', n_written, 'removed', n_removed);
end;
$$;
