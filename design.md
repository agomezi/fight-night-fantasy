# Fight Night Fantasy — design notes

## Visual language

The existing palette and type stay as they are: `#0A0A0A` ground, `#E8003D`
accent, Bebas Neue for display. A full reskin was tried on this branch —
corner-derived roles, an Unbounded/IBM Plex pairing, softened radii — and
reverted. It changed the surface without making the app better to use, which
is not worth the churn or the two extra font packages.

If the visual direction is revisited later, the thing worth keeping from that
attempt is the reasoning below about corners, not the specific hexes.

## The round lane

The one piece that survived, and the only part of the app that is structurally
specific to fighting.

### What it replaces

A pick is three decisions: **who** wins, **how**, and **in which round**. That
used to be three unrelated controls stacked vertically — a fighter row, a
method chip row, a round chip row. Nothing about that arrangement is specific
to fighting; it is a form, and any sports app would produce it.

### How it works

One horizontal lane per bout, divided into the fight's real rounds — three
cells for an undercard bout, five for a main event — with a `DEC` column at the
end. Two rails, one per corner.

```
        R1    R2    R3    R4    R5    DEC
RED   [    ][    ][    ][    ][    ][     ]   Pereira
BLUE  [    ][    ][    ][    ][    ][     ]   Hill
```

A pick has three parts and each is given independently, because they are
different levels of confidence:

- **tap the fighter's name** → they win, round and method uncalled
- **tap a round cell** → they win in that round
- **the method toggle** → KO/TKO or submission, and tapping the active one
  clears it again
- **the DEC column** → goes to the judges, where method is not a choice

Deselecting peels one layer at a time instead of wiping the pick:

- re-tap the round you chose → the round drops, fighter and method stay
- re-tap `DEC` → drops back to no round, fighter stays
- tap the active method again → method clears, fighter and round stay
- **tap the fighter's name → clears everything**, since that is the layer the
  others sit on

Switching corners keeps the method, since "someone gets submitted here" is a
view that survives changing your mind about who.

So all of these are valid picks, and the readback says which one you made:

| Pick | Readback |
|---|---|
| Fighter only | *Pereira to win* |
| Fighter + method | *Pereira by KO/TKO — any round* |
| Fighter + round | *Pereira to finish in Round 2* |
| Fighter + method + round | *Pereira by KO/TKO in Round 2* |
| Decision | *Pereira by decision* |

### Why corners

Every bout assigns one fighter the red corner and one the blue. It is on the
broadcast graphics, the scorecards, and the cage. Using that for the two rails
means the colour carries information rather than just marking the thing you
tapped.

Consequence worth remembering: **a loss should never be styled red** anywhere
that sits near the lane, because red already means red corner there.

### Why it earns its place

**It is the shape of a fight.** A bout is a timeline that ends somewhere. Chip
rows are not.

**It persists.** Once the bout is scored, the actual finish draws as a dashed
outline on the same lane, next to where your marker already is. The control
becomes the result display with nothing redrawn.

**It solves head-to-head.** An opponent's pick renders as an underline on the
same lane. Two picks on one timeline shows agreement and distance at a glance;
two separate summaries side by side never will.

**It scales down.** Collapsed on the undercard list, the row shows the pick as
a readout and expands to the full lane.

### Accessibility

Red/blue is the real convention but also the pairing most affected by common
colour deficiencies, so colour never carries corner identity alone:

- the `RED CORNER` / `BLUE CORNER` label is always present as text
- every placed marker prints its method — `KO`, `SUB`, `DEC` — inside the cell

The lane is readable in greyscale.

### Data requirement

`Fight` carries `rounds: 3 | 5`. The lane cannot render without knowing the
scheduled length. Any real fight data source has to supply it.

### Still to do

- `actual` and `rivalPick` are implemented and styled but nothing populates
  them yet — they need real scored results and an opponent's picks.
- On a narrow phone a 5-round lane fits six columns in roughly 250pt. If the
  cells prove too tight to hit, the fix is dropping the record line to widen
  the rail, or letting the lane scroll horizontally.

---

# Redesign plan — structure first

Written after a repaint attempt (corner palette, Unbounded/IBM Plex, softer
radii) was built and reverted. It changed hexes and font names while every
screen kept its existing shape, so it read as the same app recoloured.

The lesson: **the sameness is structural, not chromatic.** 38 rounded-card
styles, one `EmptyState` component rendered 10 times, and `getInitials` in 9
places will look generated in any palette. So palette comes last here, and it
only adds what is missing rather than replacing what works.

## 1. Containment is reserved for interaction

One rule replaces the one-card-for-everything pattern:

> If you cannot tap it, it does not get a box.

That yields three idioms instead of one:

| Idiom | Used for | Treatment |
|---|---|---|
| **Scorecard** | Stats, standings, records, career figures | No container. Ruled rows, hairline separators, right-aligned tabular figures. Reads like a judge's card. |
| **Card stock** | Picks, actions, the lane | The only thing that gets a raised surface, border and radius — because it is the thing you touch. |
| **Feed** | League chatter, rising stars, activity | No container. Flush-left identity, text, timestamp. Reads like messages, not cards. |

The rule is what stops this drifting back — every new section has an obvious
home, and "wrap it in a card" stops being the default.

## 2. The lane becomes the anchor, not a form control

It currently lives inside a collapsed accordion on one screen. Making it the
signature element means it appears in a different state on every screen:

- **Home** — a live lane for the main event, pickable directly. The hero *is*
  the mechanic instead of a countdown card.
- **Picks** — the full card, one lane per bout. (Where it is today.)
- **Matchup** — both picks on shared lanes. The H2H view becomes lanes stacked,
  your marker against your opponent's.
- **Profile** — settled lanes in history: your marker against the actual finish.

Appearing four times in four states is what makes something an anchor. Appearing
once inside an accordion makes it a widget.

Its colour logic then feeds the palette rather than the other way round — which
is the honest version of "derived from the sport."

## 3. Fighter identity: name plates, not circles

Initials in a circle reads as placeholder because a circle is a *social avatar*
— it says "person," not "fighter."

Replace with a **corner-striped name plate**: a tall rectangle with the corner
colour as a hard edge stripe, initials set large in the plate, record directly
beneath. That is the shape of a name on a fight bill, and it carries corner
assignment, which a circle cannot.

Works with no photography at all, and becomes the frame when photos arrive
rather than being thrown away.

## 4. Empty states are skeletons of the real thing

Ten call sites, one template: icon circle, headline, sentence, button. Each
becomes the actual component in its empty state instead:

| Screen | Now | Becomes |
|---|---|---|
| No picks | Clipboard icon + button | An empty lane, prompt inside it. The thing you are missing, shown. |
| No league | Trophy icon + button | A standings table with one row — you, 1st of 1. Shows what it will look like. |
| No history | Clock icon + sentence | A blank scorecard with ruled empty rows. |

More useful than an icon, and each is distinct because the underlying component
is.

## 5. Wordmark

Correction: the current mark is Bebas Neue — a condensed sans — skewed -8deg
with 5pt tracking. Not a serif. The generic part is the skew, which is a
shortcut for "sporty."

Replace with a **stacked poster lockup**: FIGHT over NIGHT, a rule between, no
skew. That is the construction on every fight bill ever printed, and it is
specific in a way an italic is not.

## 6. Palette — add the missing half, keep what works

Everything below is an addition. The existing ground and accent stay, because
they were kept deliberately after the reskin was rejected.

| Role | Hex | Status | Where it comes from |
|---|---|---|---|
| `ground` | `#0A0A0A` | unchanged | Existing. Works. |
| `cornerRed` | `#E8003D` | unchanged | The existing accent *is* the red corner — it just was not named that. |
| `cornerBlue` | `#2B6CD4` | **new** | Blue corner pad. The missing half of the pair. |
| `belt` | `#C9A227` | **new** | Championship plate. Titles, league wins, settled correct picks. |
| `scorecard` | `#EDE7DA` | **new** | Judges' scorecard stock. The one warm material, used for scorecard-idiom surfaces and settled results. |

Neutrals stay as they are.

Two rules that make it a system rather than a swatch list:

- Red and blue are **assignments**, not styling. They appear only where corner
  identity is real — lanes, fighter plates, H2H. Never as generic accent.
- **A loss is never red**, because red already means red corner.

## 7. Type — add a data face, keep the display face

The app currently sets Bebas for display and **nothing for body** — everything
else is the system default. That gap has never been addressed, and it is why
stats look unconsidered.

- **Display: Bebas Neue, kept.** Condensed poster type is genuinely correct for
  fight bills. The last attempt replaced it and the result was rejected. The
  problem was the skew and it being the *only* specified face, not Bebas.
- **Data: IBM Plex Sans, added.** For figure disambiguation — 41.5 against 47.5
  decides a matchup, so an ambiguous digit is a real failure. Unambiguous 1,
  flat-topped 7, open 4, true tabular figures, legible at 10px.

One addition, one retention. No wholesale swap.

## Sequence

1. Containment rule + the three idioms (§1) — the biggest visible change
2. Lane onto home, matchup, profile (§2)
3. Name plates (§3)
4. Empty states (§4)
5. Wordmark (§5)
6. Palette additions (§6) and data face (§7) — last, because they are the part
   that was already rejected once when done first

Steps 1–4 are where the "generated" read actually comes from.

---

# Empty states — the shipping default

`constants/league.ts` exports a single `DEMO` flag. It is now **`false`**, which
is the real state of a brand-new account: no league, no standings, no rivalry,
no scored picks, no notifications, no history. Flip it to `true` to design
against sample data; nothing else changes.

Two rules the screens follow, and both exist because breaking them is what made
earlier passes read as fake:

**1. Never print a number you don't have.** A watermark, a ghosted rank or a
hardcoded count sitting behind an em-dash is worse than blank space — it tells
the user the app is guessing. Everything numeric traces back to the data, so a
new account genuinely shows `—`, not a decorative `#4`.

**2. Never claim a relationship that doesn't exist.** Social proof ("8 people in
your league picked Holloway") is meaningless with no league, so it is gated on
`LEAGUE` rather than shown with invented names. Same reason league-settings
replaces itself entirely when you aren't in one: an invite code hands out a seat
in a league that doesn't exist.

Where each screen lands with nothing in it:

| Screen | Empty state |
| --- | --- |
| home | Carousel drops the league, unfinished-card and live cards; gains a **START YOUR CARD** prompt. Last-event card looks forward to your first event instead of back at a score of zero. |
| picks | The card itself is real — it exists whether or not you have an account. Social proof lines are dropped; the lock confirmation invites you to a league instead of naming strangers. |
| leagues | Whole screen becomes onboarding: create / join, plus what joining unlocks. |
| league-settings | Whole screen replaced — you cannot configure a league you aren't in. Scoring rules stay, since they're worth reading before you commit. |
| league-standings | Skeleton scorecard with a caption, not a blank table. |
| matchup | Prompt — opponents are assigned when an event opens. |
| history | Full-bleed prompt with a route into picks. |
| notifications | "All quiet." |
| profile | Zeros and `—` throughout, achievements locked, results replaced by an `EmptyState`. |

An empty state is an instruction, not an apology. Each one names the single
action that ends it, and the screens that are useless without data say so with
the whole screen rather than a shrug in the middle of a live-looking layout.
