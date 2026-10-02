# Event HTML parser

`parseEvent(html, url) -> IngestedEvent` turns a UFC.com event page into typed
bout results. It is pure: no network, filesystem, clock, logging or database.
`Fetcher` is an interface only — nothing here implements it.

```bash
bash scripts/fetch-fixtures.sh   # fixtures are not committed
npx jest services/ingestion
```

## Contract notes

`Winner` is a union: UFC pages expose corners, so they emit
`{ by: "corner", corner }`. The `{ by: "fighter", fighterId }` form exists for a
source that does not, so the parser never has to guess which corner someone
stood in.

There is no `fetchedAt` — reading a clock would break purity, and the same HTML
must always parse to a deeply-equal object. The caller stamps time when it
persists.

`issues?: string[]` flags anything unrecognised. A bout with an unknown method
is held `pending` with its raw text preserved rather than guessed, since a wrong
method silently costs a user points. `pending` with issues needs review;
`pending` without them is simply unresolved. Neither is a loss.

`DEC` results carry no round, because a decision ends when the scheduled rounds
run out. A disqualification maps to `DEC` and so drops its round too.

## Limits

A single snapshot cannot detect a fighter substitution, a bout removed from the
card, or why a fight disappeared. That needs two snapshots compared over time,
which belongs to the caller. Never infer `CANCELLED` or `FIGHTER_CHANGED` from
absence.

Tests cover all 50 bouts across four saved cards, with expected winners,
methods, rounds and times written out by hand rather than snapshotted. No
Contest, cancellation and pending states are exercised by in-memory edits to
fixture markup — no saved example of those states exists yet, so they do not
establish how the live page renders them.

The most brittle selectors are `c-listing-fight`, `data-fmid`, the corner name
and win classes, the three result fields, and
`c-hero__headline-suffix[data-timestamp]`. Missing structural fields throw;
unknown method values are held pending. The event date comes from the main-card
timestamp, not the early-prelim start.

# Card parser

`card.ts` reads upcoming cards for the schedule sync. It has no imports, so the
`sync-fight-cards` Edge Function loads it directly under Deno.

`parseCard(payload)` reads one event from the UFC stats feed: bout order
(1 is the main event), card segment, scheduled rounds, weight class and both
fighters by their feed ids. The event starts at its earliest segment, and
picks lock there. Events from other organizations (Contender Series, Road to
UFC) return null.

Segments are null until UFC splits the card, which it does a few weeks out.
Scheduled rounds come from the rule set; when that is malformed (the feed
sometimes lists "3 Rnd + OT" as four rounds) the description's count is used,
then the main-event/title rule, and the repair is noted in `issues`.

Anything structurally missing throws. A half-read card would be dangerous: the
sync cancels every stored bout that is no longer on the card.

`upcomingEventSlugs` and `eventFmid` find cards on the UFC.com events listing.
A card can be listed before it has a feed id; the sync reports it as waiting
and picks it up later. Do not use the `<time datetime>` values on UFC.com
event pages: they are Eastern time labelled as UTC.

The feed's base URL is a Supabase secret (`UFC_FEED_BASE_URL`) and is never
committed, so the card tests use hand-built payloads rather than saved ones.

# Photo matching

`photos.ts` matches card fighters to API-Sports fighters for their photos.
A fighter is only matched when one API-Sports fight on the card's date holds
**both** of the bout's fighters, so two fighters sharing a surname cannot be
swapped; a wrong face is worse than initials. Names compare without accents,
punctuation or "Jr.", and the same surname with the same first initial counts
as the same person ("Alex" / "Alexandre Pereira").

Fighters the date match cannot reach — usually because API-Sports does not
list their bout — are then looked up by name (`matchByName`). With no
opponent to corroborate, that match is stricter: identical full names only,
no first-initial leeway, and two API-Sports fighters with one name are told
apart by weight class or skipped. Single-word names are never matched by name.

The sync fills each fighter in once (`set_fighter_photos`) and never
overwrites a photo after that. Without `APISPORTS_KEY` the step is skipped.

# Live results

`results.ts` reads each bout's result from the UFC stats feed for the
`sync-results` Edge Function. A result is used as soon as `Result.Method` is
set: the bout can still read "Live" or "Over" for about ten minutes after
that. Until the bout reads "Final" the result is provisional, because the feed
corrects itself (a round was changed three minutes after first publishing).

A draw is published as the decision that produced it ("Decision -
Unanimous"), so it is read from both fighters' outcomes being "Draw". "Could
Not Continue" with both outcomes "No Contest" is a No Contest. Method prose
goes through the same `normalizeMethod` and `METHOD_RULINGS` as the event-page
parser, now in `methods.ts` so Deno can import them.

Results are written only when they change, so polling every 30 seconds adds no
revisions. Manual corrections are never overwritten. After every poll the
whole card is re-scored from what is stored (`services/eventScoring.ts`) and
its scores replaced, so corrections, cancellations and fighter swaps all come
out right without patching anything.

Each event stores when it is next due. The function polls every 30 seconds
while a fight is on, every minute between fights, every 5 minutes before the
card, every 2 minutes until every result is final, then every 6 hours for a
week to catch overturned results. pg_cron checks every 30 seconds and only
calls the function when an event is due.

The feed carries no betting odds, so `bouts.underdog_corner` is never set
here and the underdog bonus does not apply until another source fills it.
