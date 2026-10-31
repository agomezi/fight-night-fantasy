-- Profile titles: you can wear only an award you've won, others see it unless
-- you're hidden from them, and it goes when the badge goes.
-- Runs with `npx supabase test db`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.act(n int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(n), 'role', 'authenticated')::text, true);
$$;
insert into auth.users (id, email) select pg_temp.u(n), 'pt' || n || '@example.test' from generate_series(1, 3) n;
update public.profiles p set display_name = 'Titler' || v.n from generate_series(1, 3) v(n) where p.id = pg_temp.u(v.n);

-- Player 1 won Round Sniper at a season's final drop.
insert into public.seasons (id, number) values ('00000000-0000-0000-0000-0000000000f1', 901);
create temp table final_drop as select gen_random_uuid() as id;
insert into public.award_drops (id, label, kind, season_id)
select id, 'Season end', 'final', '00000000-0000-0000-0000-0000000000f1' from final_drop;
insert into public.drop_awards (drop_id, scope, award, user_id, value)
select id, 'global', 'sniper', pg_temp.u(1), 0.4 from final_drop;
select public.publish_award_drop((select id from final_drop));
grant select on final_drop to authenticated;

set local role authenticated;
select pg_temp.act(1);
select is(public.player_title(pg_temp.u(1)), null, 'no title until you pick one');
select throws_ok($$select public.set_profile_title('p4p')$$, '22023', null, 'you can''t wear an award you didn''t win');
select throws_ok($$select public.set_profile_title('made_up')$$, '22023', null, 'or one that doesn''t exist');
select lives_ok($$select public.set_profile_title('sniper')$$, 'you can wear one you won');
select is(public.player_title(pg_temp.u(1)), 'sniper', 'and you see it');
select pg_temp.act(2);
select is(public.player_title(pg_temp.u(1)), 'sniper', 'so does anyone who opens your card');
select throws_ok($$update public.profiles set title_award = 'p4p' where id = pg_temp.u(2)$$, '42501', null,
  'the title can only be set through set_profile_title');

select pg_temp.act(1);
select lives_ok($$select public.set_profile_title(null)$$, 'taking it off works');
select is(public.player_title(pg_temp.u(1)), null, 'and it''s gone');
select public.set_profile_title('sniper');

reset role;
insert into public.player_blocks (blocker, blocked) values (pg_temp.u(3), pg_temp.u(1));
set local role authenticated;
select pg_temp.act(3);
select is(public.player_title(pg_temp.u(1)), null, 'nothing for a player you''ve blocked');

reset role;
set local role anon;
select throws_ok($$select public.player_title('00000000-0000-0000-0000-000000000001')$$, '42501', null, 'signed-out callers can''t read titles');
select throws_ok($$select public.set_profile_title(null)$$, '42501', null, 'or set one');

reset role;
set local session_replication_role = replica;
insert into public.moderation_actions (case_id, player, action) values (0, pg_temp.u(1), 'ban');
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.act(2);
select is(public.player_title(pg_temp.u(1)), null, 'nothing for a banned player');

reset role;
delete from public.moderation_actions where player = pg_temp.u(1);
update public.profiles set display_name = null, deleted_at = now() where id = pg_temp.u(1);
set local role authenticated;
select pg_temp.act(2);
select is(public.player_title(pg_temp.u(1)), null, 'nothing for a deleted account');
reset role;
update public.profiles set deleted_at = null, display_name = 'Titler1' where id = pg_temp.u(1);
select public.delete_award_drop((select id from final_drop));
set local role authenticated;
select pg_temp.act(2);
select is(public.player_title(pg_temp.u(1)), null, 'the title goes when its badge does');
select pg_temp.act(1);
select throws_ok($$select public.set_profile_title('sniper')$$, '22023', null, 'and can''t be put back on');

select * from finish();
rollback;
