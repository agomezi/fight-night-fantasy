-- Fighter Spotlight on home.
--
-- Home spotlights the main event's two fighters. Setting this column, by hand
-- in the dashboard, puts another fighter on the card first instead, with
-- their opponent second. A fighter who isn't on the card is ignored, so a
-- stale choice falls back to the main event. Card sync never touches it.

alter table public.events
  add column spotlight_fighter_id uuid references public.fighters (id) on delete set null;
