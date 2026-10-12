-- Result notifications carry the bout they are about, so tapping one opens
-- your history at that fight.

create or replace function public.claim_event_notifications(event_id uuid)
returns table (user_id uuid, kind text, payload jsonb, tokens text[], wanted boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ev public.events%rowtype;
  is_final boolean;
begin
  select * into ev from public.events e where e.id = claim_event_notifications.event_id;
  if not found then
    return;
  end if;

  -- Final once the card is over and nothing still scheduled lacks a final
  -- result.
  is_final := ev.status = 'complete' and not exists (
    select 1 from public.bouts b
    left join public.results r on r.bout_id = b.id
    where b.event_id = ev.id and b.status = 'scheduled' and (r.bout_id is null or r.status <> 'final')
  );

  return query
  with scored as (
    select s.user_id, 'scored'::text as kind, s.bout_id || ':' || s.points as key,
      jsonb_build_object(
        'event', ev.name,
        'bout', s.bout_id,
        'points', s.points,
        'dogBonus', coalesce((s.breakdown->>'underdogBonus')::integer, 0),
        'correct', s.correct,
        'counts', s.counts_for_accuracy,
        'provisional', s.provisional,
        'winner', w.name,
        'loser', case when r.winner_fighter_id = b.red_fighter_id then blue.name else red.name end,
        'red', red.name,
        'blue', blue.name,
        'method', r.method,
        'round', r.round,
        'time', r.time,
        'void', coalesce(r.void_reason::text, case when b.status = 'cancelled' then 'CANCELLED' end),
        'correction', exists (
          select 1 from public.notifications_sent n
          where n.user_id = s.user_id and n.kind = 'scored' and n.key like s.bout_id || ':%'
        )
      ) as payload
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    join public.fighters red on red.id = b.red_fighter_id
    join public.fighters blue on blue.id = b.blue_fighter_id
    left join public.results r on r.bout_id = b.id
    left join public.fighters w on w.id = r.winner_fighter_id
    where b.event_id = ev.id
  ),
  final as (
    select s.user_id, 'final'::text as kind, ev.id::text as key,
      jsonb_build_object(
        'event', ev.name,
        'points', sum(s.points),
        'hit', count(*) filter (where s.correct),
        'total', count(*) filter (where s.counts_for_accuracy)
      ) as payload
    from public.scores s
    join public.bouts b on b.id = s.bout_id
    where is_final and b.event_id = ev.id
    group by s.user_id
  ),
  candidates as (
    select * from scored
    union all
    select * from final
  ),
  claimed as (
    insert into public.notifications_sent (user_id, kind, key, payload)
    select c.user_id, c.kind, c.key, c.payload from candidates c
    on conflict do nothing
    returning notifications_sent.user_id, notifications_sent.kind, notifications_sent.key
  )
  select c.user_id, c.kind, c.payload,
    array(select t.token from public.push_tokens t where t.user_id = c.user_id),
    case c.kind when 'scored' then p.notify_results else p.notify_summary end
  from candidates c
  join claimed k on k.user_id = c.user_id and k.kind = c.kind and k.key = c.key
  join public.profiles p on p.id = c.user_id
  where p.deleted_at is null;
end;
$$;
