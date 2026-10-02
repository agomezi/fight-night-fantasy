-- Live results: writing results only when they change, manual corrections
-- staying put, replacing an event's scores, and which events are due a poll.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- A card in the shape parseCard produces, and results in the shape
-- parseResults produces. Fighters are named by UFC id.
create function pg_temp.f(id text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFighterId', id, 'name', 'Fighter ' || id, 'nickname', null)
$$;
create function pg_temp.bout(fight text, ord int, red text, blue text) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'order', ord, 'segment', 'main', 'scheduledRounds', 3,
    'weightClass', 'Lightweight', 'red', pg_temp.f(red), 'blue', pg_temp.f(blue))
$$;
create function pg_temp.card(event text, starts timestamptz, bouts jsonb) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', event, 'name', 'Card ' || event, 'startsAt', starts,
    'status', 'scheduled', 'bouts', bouts, 'issues', '[]'::jsonb)
$$;
create function pg_temp.res(final boolean, winner text, method text, rnd int, tm text, void text default null)
returns jsonb language sql as $$
  select jsonb_build_object('final', final, 'winnerUfcFighterId', winner, 'method', method, 'round', rnd,
    'time', tm, 'voidReason', void, 'raw', jsonb_build_object('method', coalesce(method, void)))
$$;
create function pg_temp.live(event text, status text, bouts jsonb) returns jsonb language sql as $$
  select jsonb_build_object('ufcEventId', event, 'status', status, 'liveFightId', null, 'bouts', bouts)
$$;
create function pg_temp.lb(fight text, result jsonb) returns jsonb language sql as $$
  select jsonb_build_object('ufcFightId', fight, 'status', 'complete', 'result', result)
$$;
create function pg_temp.r(fight text) returns public.results language sql as $$
  select r.* from public.results r join public.bouts b on b.id = r.bout_id where b.ufc_fight_id = fight
$$;
create function pg_temp.bid(fight text) returns uuid language sql as $$
  select id from public.bouts where ufc_fight_id = fight
$$;
create function pg_temp.revisions() returns int language sql as $$
  select count(*)::int from public.result_revisions rv join public.bouts b on b.id = rv.bout_id where b.ufc_fight_id like '9%'
$$;

-- A card on tonight, already locked.
select public.sync_event_card(pg_temp.card('900', now() - interval '1 hour', jsonb_build_array(
  pg_temp.bout('901', 1, 'r1', 'b1'),
  pg_temp.bout('902', 2, 'r2', 'b2'),
  pg_temp.bout('903', 3, 'r3', 'b3'),
  pg_temp.bout('904', 4, 'r4', 'b4')
)));

set local role service_role;

-------------------------------------------------------------------------------
-- Writing results
-------------------------------------------------------------------------------

select is(
  public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
    pg_temp.lb('901', pg_temp.res(true, 'b1', 'KO', 1, '4:55')),
    pg_temp.lb('902', pg_temp.res(false, 'r2', 'SUB', 3, '4:46')),
    pg_temp.lb('903', pg_temp.res(true, 'r3', 'DEC', null, '5:00')),
    pg_temp.lb('904', null)
  ))) - 'event_id',
  '{"written": 3, "unknown": []}'::jsonb,
  'every bout with a result is written; one without is skipped'
);

select is((select status from public.events where ufc_event_id = '900'), 'live'::public.event_status, 'the event takes the feed status');
select is((pg_temp.r('901')).winner_fighter_id, (select id from public.fighters where ufc_fighter_id = 'b1'), 'the winner is mapped from the UFC fighter id');
select is((pg_temp.r('901')).status, 'final'::public.result_status, 'a Final bout is stored final');
select is((pg_temp.r('901')).source, 'ufc_live'::public.result_source, 'the source is the live feed');
select is((pg_temp.r('902')).status, 'provisional'::public.result_status, 'a result before Final is provisional');
select is((pg_temp.r('903')).round, null, 'a decision stores no round');
select is((pg_temp.r('904')).bout_id, null, 'a bout with no result has no row');
select is(pg_temp.revisions(), 3, 'each written result leaves a revision');

-- The same feed again.
select is(
  public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
    pg_temp.lb('901', pg_temp.res(true, 'b1', 'KO', 1, '4:55')),
    pg_temp.lb('902', pg_temp.res(false, 'r2', 'SUB', 3, '4:46')),
    pg_temp.lb('903', pg_temp.res(true, 'r3', 'DEC', null, '5:00'))
  ))) -> 'written',
  '0'::jsonb,
  'an unchanged poll writes nothing'
);
select is(pg_temp.revisions(), 3, 'and adds no revision');

-- The feed corrects the round, then marks the bout final.
select is(
  public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
    pg_temp.lb('902', pg_temp.res(false, 'r2', 'SUB', 2, '4:46'))
  ))) -> 'written',
  '1'::jsonb,
  'a corrected round is written'
);
select is((pg_temp.r('902')).round, 2::smallint, 'the correction replaces the round');
select public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
  pg_temp.lb('902', pg_temp.res(true, 'r2', 'SUB', 2, '4:46'))
)));
select is((pg_temp.r('902')).status, 'final'::public.result_status, 'turning final is a change');
select is(pg_temp.revisions(), 5, 'both versions are kept as revisions');

-- A No Contest.
select public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
  pg_temp.lb('904', pg_temp.res(false, null, null, null, '0:15', 'NC'))
)));
select results_eq(
  $$select void_reason::text, winner_fighter_id, round from public.results where bout_id = pg_temp.bid('904')$$,
  $$values ('NC', null::uuid, null::smallint)$$,
  'a No Contest is stored void with no winner'
);

select is(
  public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
    pg_temp.lb('999', pg_temp.res(true, 'r1', 'KO', 1, '1:00'))
  ))) -> 'unknown',
  '["999"]'::jsonb,
  'a bout the card sync has not stored yet is reported, not written'
);

select throws_ok(
  $$select public.record_event_results(pg_temp.live('nope', 'live', '[]'::jsonb))$$,
  'P0001', 'event nope is not stored',
  'an unknown event is refused'
);

-- A human correction is sticky.
reset role;
update public.results set winner_fighter_id = (select id from public.fighters where ufc_fighter_id = 'r1'),
  method = 'SUB', source = 'manual', manual_override = true
where bout_id = pg_temp.bid('901');
set local role service_role;
select public.record_event_results(pg_temp.live('900', 'live', jsonb_build_array(
  pg_temp.lb('901', pg_temp.res(true, 'b1', 'KO', 1, '4:55'))
)));
select is((pg_temp.r('901')).method, 'SUB'::public.result_method, 'the feed does not overwrite a manual result');

-------------------------------------------------------------------------------
-- Replacing scores
-------------------------------------------------------------------------------

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'bob@example.test');
set local role service_role;

create function pg_temp.score(usr text, fight text, points int, provisional boolean default false)
returns jsonb language sql as $$
  select jsonb_build_object('user_id', usr, 'bout_id', pg_temp.bid(fight), 'points', points,
    'breakdown', jsonb_build_object('fighter', 50, 'method', 0, 'round', 0, 'underdogBonus', 0),
    'correct', points > 0, 'counts_for_accuracy', true, 'provisional', provisional)
$$;
create function pg_temp.ev() returns uuid language sql as $$
  select id from public.events where ufc_event_id = '900'
$$;

select is(
  public.replace_event_scores(pg_temp.ev(), jsonb_build_array(
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '901', 50),
    pg_temp.score('00000000-0000-0000-0000-0000000000a2', '901', -50),
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '902', 125, true)
  )),
  '{"written": 3, "removed": 0}'::jsonb,
  'new scores are written'
);
select is(
  (select provisional from public.scores where user_id = '00000000-0000-0000-0000-0000000000a1' and bout_id = pg_temp.bid('902')),
  true,
  'the provisional flag is stored'
);

select is(
  public.replace_event_scores(pg_temp.ev(), jsonb_build_array(
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '901', 50),
    pg_temp.score('00000000-0000-0000-0000-0000000000a2', '901', -50),
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '902', 125, true)
  )),
  '{"written": 0, "removed": 0}'::jsonb,
  'unchanged scores are not rewritten'
);

select is(
  public.replace_event_scores(pg_temp.ev(), jsonb_build_array(
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '901', 50),
    pg_temp.score('00000000-0000-0000-0000-0000000000a1', '902', 125, false)
  )),
  '{"written": 1, "removed": 1}'::jsonb,
  'a changed score is rewritten and a score with no row is removed'
);
select is((select count(*)::int from public.scores where bout_id in (pg_temp.bid('901'), pg_temp.bid('902'))), 2, 'two scores remain');

-- A score on another event's bout is refused, and nothing is written.
select public.sync_event_card(pg_temp.card('800', now() + interval '3 days', jsonb_build_array(pg_temp.bout('801', 1, 'r8', 'b8'))));
select throws_ok(
  format($$select public.replace_event_scores(%L, %L)$$, pg_temp.ev(),
    jsonb_build_array(pg_temp.score('00000000-0000-0000-0000-0000000000a1', '801', 50))),
  'P0001', null,
  'scores for bouts outside the event are refused'
);

-------------------------------------------------------------------------------
-- What is due
-------------------------------------------------------------------------------

select ok(pg_temp.ev() in (select id from public.events_due_for_results()), 'an event on tonight that was never polled is due');
select ok(
  (select id from public.events where ufc_event_id = '800') not in (select id from public.events_due_for_results()),
  'an event days away is not due'
);
select public.set_results_due(pg_temp.ev(), now() + interval '30 seconds');
select ok(pg_temp.ev() not in (select id from public.events_due_for_results()), 'an event polled moments ago is not due');
select public.set_results_due(pg_temp.ev(), now() - interval '1 second');
select ok(pg_temp.ev() in (select id from public.events_due_for_results()), 'it is due again once its time passes');

reset role;
update public.events set starts_at = now() - interval '8 days', locks_at = now() - interval '8 days' where id = pg_temp.ev();
select ok(pg_temp.ev() not in (select id from public.events_due_for_results()), 'a card more than a week old is no longer polled');

-------------------------------------------------------------------------------
-- Access
-------------------------------------------------------------------------------

set local role authenticated;
select throws_ok($$select public.record_event_results('{}'::jsonb)$$, '42501', null, 'users cannot write results');
select throws_ok($$select public.replace_event_scores(gen_random_uuid(), '[]'::jsonb)$$, '42501', null, 'users cannot write scores');
reset role;

select * from finish();
rollback;
