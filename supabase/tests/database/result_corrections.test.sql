-- Result corrections: setting a result by hand, voiding a bout, the feed
-- leaving manual results alone until released, and that only the owner can
-- do any of it.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.f(id text, name text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', name, 'nickname', null)
$$;
select public.sync_event_card(jsonb_build_object(
  'ufcEventId', 'c1', 'name', 'UFC 999: Fix vs. It', 'startsAt', now() - interval '2 hours',
  'status', 'live', 'issues', '[]'::jsonb, 'bouts', jsonb_build_array(
    jsonb_build_object('ufcFightId', 'c11', 'order', 1, 'segment', 'main', 'scheduledRounds', 5,
      'weightClass', null, 'red', pg_temp.f('cr', 'Rafael Dos Anjos'), 'blue', pg_temp.f('cb', 'Alexander Hernandez')))));
create function pg_temp.bout() returns uuid language sql as $$ select id from public.bouts where ufc_fight_id = 'c11' $$;
create function pg_temp.r() returns public.results language sql as $$ select * from public.results where bout_id = pg_temp.bout() $$;

-- The feed got it wrong.
select public.record_event_results(jsonb_build_object('ufcEventId', 'c1', 'status', 'live', 'liveFightId', null,
  'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'c11', 'status', 'complete', 'result',
    jsonb_build_object('final', true, 'winnerUfcFighterId', 'cr', 'method', 'DEC', 'round', null, 'time', '5:00',
      'voidReason', null, 'raw', '{}'::jsonb)))));

select is((select count(*)::int from public.recent_bouts where bout_id = pg_temp.bout()), 1, 'recent bouts lists the bout');

select is(public.correct_result(pg_temp.bout(), 'Hernandez', 'KO', 2, '3:41'), 'corrected and re-scoring',
  'a result can be corrected by part of the winner''s name');
select results_eq(
  $$select w.name, r.method::text, r.round::int, r.time, r.status::text, r.source::text, r.manual_override
    from public.results r join public.fighters w on w.id = r.winner_fighter_id where r.bout_id = pg_temp.bout()$$,
  $$values ('Alexander Hernandez', 'KO', 2, '3:41', 'final', 'manual', true)$$,
  'the correction is final, manual and sticky'
);
select ok((select results_due_at <= now() from public.events where ufc_event_id = 'c1'), 'the event is marked for re-scoring');

-- The feed reports its old answer again; the correction stands.
select public.record_event_results(jsonb_build_object('ufcEventId', 'c1', 'status', 'complete', 'liveFightId', null,
  'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'c11', 'status', 'complete', 'result',
    jsonb_build_object('final', true, 'winnerUfcFighterId', 'cr', 'method', 'DEC', 'round', null, 'time', '5:00',
      'voidReason', null, 'raw', '{}'::jsonb)))));
select is((pg_temp.r()).method, 'KO'::public.result_method, 'the feed does not overwrite a correction');

select throws_ok($$select public.correct_result(pg_temp.bout(), 'Pereira', 'KO', 1)$$, 'P0001', null,
  'a name that matches neither fighter is refused');
select throws_ok($$select public.correct_result(pg_temp.bout(), 'red', 'DEC', 3)$$, 'P0001', null,
  'a decision with a round is refused');
select throws_ok($$select public.correct_result(pg_temp.bout(), 'red', 'SUB')$$, 'P0001', null,
  'a finish without a round is refused');

select is(public.void_bout(pg_temp.bout(), 'NC'), 'voided and re-scoring', 'a bout can be voided');
select results_eq(
  $$select winner_fighter_id, method::text, void_reason::text, manual_override from public.results where bout_id = pg_temp.bout()$$,
  $$values (null::uuid, null::text, 'NC', true)$$,
  'the void replaces the result'
);

-- Handed back, the feed's next answer wins.
select public.release_result(pg_temp.bout());
select public.record_event_results(jsonb_build_object('ufcEventId', 'c1', 'status', 'complete', 'liveFightId', null,
  'bouts', jsonb_build_array(jsonb_build_object('ufcFightId', 'c11', 'status', 'complete', 'result',
    jsonb_build_object('final', true, 'winnerUfcFighterId', 'cb', 'method', 'SUB', 'round', 3, 'time', '1:10',
      'voidReason', null, 'raw', '{}'::jsonb)))));
select results_eq(
  $$select method::text, round::int, source::text, manual_override from public.results where bout_id = pg_temp.bout()$$,
  $$values ('SUB', 3, 'ufc_live', false)$$,
  'once released, the feed owns the result again'
);

set local role authenticated;
select throws_ok($$select public.correct_result(pg_temp.bout(), 'red', 'KO', 1)$$, '42501', null, 'players cannot correct results');
select throws_ok($$select * from public.recent_bouts$$, '42501', null, 'players cannot read the correction view');
reset role;

select * from finish();
rollback;
