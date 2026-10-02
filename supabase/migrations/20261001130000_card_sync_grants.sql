-- The card sync runs as service_role, and its functions run with the caller's
-- privileges. The hosted project does not grant new tables to any role by
-- default, so service_role needs explicit grants for what the sync touches.
--
-- Revoke first so a local stack, which does grant everything by default,
-- ends up with the same privileges as hosted and the tests catch a missing
-- grant.

revoke all on public.events, public.bouts, public.fighters, public.seasons from service_role;

grant select, insert, update on public.events, public.bouts, public.fighters to service_role;
grant select, insert on public.seasons to service_role;
