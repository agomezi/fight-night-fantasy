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
