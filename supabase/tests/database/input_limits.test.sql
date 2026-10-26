-- Input limits: wrong invite codes across join_league and league_preview,
-- starting leagues, and push tokens per account. All run as `authenticated`.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-------------------------------------------------------------------------------
-- Fixtures
-------------------------------------------------------------------------------

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
-- The hint of the error a statement raises, or null if it doesn't raise.
create function pg_temp.hint_of(q text) returns text language plpgsql as $$
declare
  h text;
begin
  execute q;
  return null;
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return h;
end;
$$;
create function pg_temp.attempts(n int, k text) returns int language sql security definer as $$
  select count(*)::int from public.input_attempts where user_id = pg_temp.u(n) and kind = k
$$;
create function pg_temp.tokens(n int) returns setof text language sql security definer as $$
  select token from public.push_tokens where user_id = pg_temp.u(n) order by token
$$;
create function pg_temp.sql_count(q text) returns int language plpgsql security definer as $$
declare
  c int;
begin
  execute q into c;
  return c;
end;
$$;
create function pg_temp.age_attempts(n int, k text, by interval) returns void language sql security definer as $$
  update public.input_attempts set created_at = created_at - by where user_id = pg_temp.u(n) and kind = k
$$;

insert into auth.users (id, email) select pg_temp.u(n), 'il' || n || '@example.test' from generate_series(1, 21) n;
update public.profiles p set display_name = 'Limiter' || v.n from generate_series(1, 21) v(n) where p.id = pg_temp.u(v.n);

insert into public.leagues (id, name, owner_id, tier, invite_code)
values ('00000000-0000-0000-0000-0000000000e1', 'Limit League', pg_temp.u(1), 'casual', 'lim0code'),
       ('00000000-0000-0000-0000-0000000000e2', 'Other League', pg_temp.u(1), 'casual', 'lim1code'),
       ('00000000-0000-0000-0000-0000000000e3', 'Full League', pg_temp.u(10), 'casual', 'lim2full');
insert into public.league_members (league_id, user_id)
values ('00000000-0000-0000-0000-0000000000e1', pg_temp.u(1)), ('00000000-0000-0000-0000-0000000000e2', pg_temp.u(1));
insert into public.league_members (league_id, user_id)
select '00000000-0000-0000-0000-0000000000e3', pg_temp.u(n) from generate_series(10, 21) n;

set local role authenticated;

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

select pg_temp.act(2);
select throws_ok($$select count(*) from public.input_attempts$$, '42501', null, 'players cannot read the attempts');
select throws_ok($$insert into public.input_attempts (user_id, kind) values (pg_temp.u(2), 'invite_code')$$,
  '42501', null, 'or write them');
select throws_ok($$select public.check_input_limit(pg_temp.u(2), 'invite_code')$$, '42501', null,
  'the check is not callable by players');
select throws_ok($$select public.record_input_attempt(pg_temp.u(2), 'invite_code')$$, '42501', null,
  'nor is recording an attempt');
select ok(has_function_privilege('authenticated', 'public.join_league(text)', 'execute')
          and has_function_privilege('authenticated', 'public.league_preview(text)', 'execute')
          and has_function_privilege('authenticated', 'public.create_league(text, public.league_tier)', 'execute')
          and has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'execute'),
  'players can still call every capped function');
select ok(not has_function_privilege('anon', 'public.join_league(text)', 'execute')
          and not has_function_privilege('anon', 'public.league_preview(text)', 'execute'),
  'signed-out callers cannot guess codes');

-------------------------------------------------------------------------------
-- Invite codes
-------------------------------------------------------------------------------

-- A wrong code is answered the way a raised error is, and kept.
select is(public.join_league('nope0001'),
  '{"code": "P0001", "message": "No league has that code.", "details": null, "hint": "not_found"}'::jsonb,
  'a wrong code gets the not_found error body');
select is(current_setting('response.status', true), '400', 'with status 400');
select is(pg_temp.attempts(2, 'invite_code'), 1, 'and counts as one try');

select is((select count(*)::int from public.league_preview('nope0002')), 0, 'a wrong code still previews as no row');
select is(pg_temp.attempts(2, 'invite_code'), 2, 'and counts against the same limit');

-- Right codes never count, even when they're refused for another reason.
select set_config('response.status', '', true);
select is(public.join_league('lim0code'), to_jsonb('00000000-0000-0000-0000-0000000000e1'::uuid), 'a right code joins');
select is(current_setting('response.status', true), '', 'with the usual status');
select is((select name from public.league_preview(' LIM1CODE ')), 'Other League', 'a right code previews');
select is(public.join_league('lim0code'), to_jsonb('00000000-0000-0000-0000-0000000000e1'::uuid), 'joining again does nothing');
select throws_ok($$select public.join_league('lim2full')$$, 'P0001', 'That league is full.', 'a full league is refused');
select is(pg_temp.attempts(2, 'invite_code'), 2, 'none of those count');

-- Eight more wrong ones make ten.
select public.join_league('nope1' || n) from generate_series(1, 4) n;
select count(*) from generate_series(1, 4) n, lateral public.league_preview('nope2' || n) p;
select is(pg_temp.attempts(2, 'invite_code'), 10, 'ten wrong codes are counted');

select is(pg_temp.hint_of($$select public.join_league('nope0003')$$), 'rate_limited', 'the eleventh is refused');
select throws_ok($$select public.join_league('lim1code')$$, 'P0001', 'Too many tries. Wait a bit and try again.',
  'and so is a right code, so a guess can''t be confirmed');
select is(pg_temp.hint_of($$select * from public.league_preview('lim1code')$$), 'rate_limited',
  'the preview is refused too');
select is(pg_temp.attempts(2, 'invite_code'), 10, 'refused calls are not counted');
select is(pg_temp.sql_count($$select count(*)::int from public.league_members where user_id = pg_temp.u(2)$$), 1,
  'and joined nothing');

-- Another player is unaffected.
select pg_temp.act(3);
select is(public.join_league('lim1code'), to_jsonb('00000000-0000-0000-0000-0000000000e2'::uuid),
  'another player can still join');

-- An hour after the oldest wrong code, there's room for one more.
select pg_temp.act(2);
select pg_temp.age_attempts(2, 'invite_code', interval '61 minutes');
select is(public.join_league('lim1code'), to_jsonb('00000000-0000-0000-0000-0000000000e2'::uuid),
  'an hour later codes work again');
select is(pg_temp.attempts(2, 'invite_code'), 0, 'and the old tries are cleared');

-------------------------------------------------------------------------------
-- Starting leagues
-------------------------------------------------------------------------------

select pg_temp.act(4);
select throws_ok($$select public.create_league('   ')$$, 'P0001', 'League names are 1 to 40 characters.',
  'a refused name is refused as before');
select is(pg_temp.attempts(4, 'create_league'), 0, 'and does not count');
select public.create_league('Started ' || n) from generate_series(1, 5) n;
select is(pg_temp.attempts(4, 'create_league'), 5, 'five leagues are started');
select is(pg_temp.hint_of($$select public.create_league('Started 6')$$), 'rate_limited', 'the sixth that day is refused');
select throws_ok($$select public.create_league('Started 6')$$, 'P0001', 'You''ve started 5 leagues today. Try again tomorrow.',
  'saying when to come back');
select is(pg_temp.sql_count($$select count(*)::int from public.leagues where owner_id = pg_temp.u(4)$$), 5, 'and not created');
select is(pg_temp.attempts(4, 'create_league'), 5, 'nor counted');
select pg_temp.age_attempts(4, 'create_league', interval '1 day');
select ok(public.create_league('Started 6') is not null, 'a day later one more can be started');

-------------------------------------------------------------------------------
-- Push tokens
-------------------------------------------------------------------------------

select pg_temp.act(6);
select public.register_push_token('ExponentPushToken[il60]', 'ios');
select public.register_push_token('ExponentPushToken[il61]', 'android');
select pg_temp.act(5);
select public.register_push_token('ExponentPushToken[il' || lpad(n::text, 2, '0') || ']', 'ios')
from generate_series(1, 12) n;
-- The first two again, as if those phones opened the app last.
select public.register_push_token('ExponentPushToken[il01]', 'ios');
select public.register_push_token('ExponentPushToken[il02]', 'ios');
select is((select count(*)::int from pg_temp.tokens(5)), 10, 'an account keeps ten phones');
select ok(not exists (select 1 from pg_temp.tokens(5) t
                      where t in ('ExponentPushToken[il03]', 'ExponentPushToken[il04]')),
  'the two registered longest ago are dropped');
select is((select count(*)::int from pg_temp.tokens(6)), 2, 'another account keeps its phones');
-- A phone that signs in to another account moves with it.
select pg_temp.act(6);
select public.register_push_token('ExponentPushToken[il05]', 'ios');
select is((select count(*)::int from pg_temp.tokens(5)), 9, 'the old account loses that phone');
select is((select count(*)::int from pg_temp.tokens(6)), 3, 'and the new one gains it');

select * from finish();
rollback;
