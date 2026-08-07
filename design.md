# Fight Night Fantasy — design plan

Status: proposal. Nothing here is implemented yet.

Scope: this document defines colour roles, type, and one signature interaction.
It does not define component APIs — those follow once the direction is agreed.

---

## 1. Colour

### Why not "dark charcoal plus one accent"

That formula is what the last three attempts used, and it fails for a
structural reason rather than a taste one: a single accent on a neutral ground
has nothing to say about *this* app. The accent ends up marking "the thing you
tapped", which every app needs, so the palette carries no product meaning.

Combat sports already solve this. Every bout assigns one fighter the **red
corner** and one the **blue corner**. It is on the broadcast graphics, the
scorecards, and the cage itself. Two opposed colours that mean "these are the
two sides" is not decoration — it is the data model of a fight.

That gives the palette a job: red and blue are never styling choices, they are
corner assignments. A screen showing one fighter is red or blue because of who
that fighter is, not because we wanted contrast there.

### Roles

Named for what they are in this app. No `surface-container-lowest`, no
`on-primary-fixed-variant` — those names come from a generator that has to
describe every possible app, so they describe none.

| Role | Hex | Where it comes from | Used for |
|---|---|---|---|
| `fence` | `#0B0C0F` | Vinyl-coated cage mesh — matte, near-black, slightly cool, never pure `#000` | App ground |
| `apron` | `#15171C` | The padded apron around the canvas, one step up in value from the fence | Raised surfaces, result cards, sheets |
| `seam` | `#22252C` | The taped seams between cage panels | Hairlines, dividers, table rules |
| `canvas` | `#E9E4D9` | Octagon canvas — off-white, warm, scuffed. Not `#FFFFFF` | Primary text on dark; ground in light mode |
| `cornerRed` | `#DE2033` | Red corner pad | Fighter in the red corner; your side in H2H |
| `cornerBlue` | `#2A6BD4` | Blue corner pad | Fighter in the blue corner; opponent in H2H |
| `belt` | `#C4A252` | Championship belt plate — brass, not yellow gold | Title bouts, league champion, wins |

Derived, not new hues: `canvasDim #9A968C` and `canvasFaint #63615B` for
secondary and tertiary text — the canvas colour walked down in value so muted
text stays warm instead of going grey.

### Rules

- Red and blue are **assigned, never chosen**. A fighter card is red because
  that fighter is in the red corner.
- `belt` marks outcomes that are permanent — a title, a league win, a settled
  correct pick. Never used for hover, focus, or selection.
- Live/in-progress state is motion (pulse) plus `canvas`, not a fourth colour.
- Loss states use `canvasFaint` and reduced opacity, not a red. Red already
  means "red corner"; overloading it to also mean "wrong" breaks the system.

### Light mode

Invert the ground relationship, not the hues: `canvas` becomes the ground,
`fence` becomes the text. Corner colours darken slightly (`#C41B2C`,
`#1F55AC`) to hold contrast on a warm light ground. `belt` darkens to `#8A6F2E`.

---

## 2. Type

### Pairing

**Display — Archivo Expanded, 700–900.**
Every app in this category uses a condensed face: Bebas Neue, Oswald, Anton.
The current codebase uses Bebas. Condensed is the default *because* fight
graphics use it, which means it is the one choice guaranteed to look like
everyone else.

Expanded inverts that at the same weight. Fight posters get their mass from
width as much as compression, so wide-and-heavy still reads as the category
while being immediately distinguishable from competitors. Its flat terminals
and open counters hold together at 40px+, which matters because scores are the
largest type in the app.

Used only for: fighter names in a bout, scores, event titles. Nothing under 20px.

**Body and data — IBM Plex Sans.**
Chosen for figure disambiguation. This app is decided by numbers: `41.5` versus
`47.5` decides a head-to-head, and a misread digit is a real failure, not a
cosmetic one. Plex draws an unambiguous `1`, a flat-topped `7`, and an open
`4`, and ships true tabular figures so points stay aligned down a standings
column. It stays legible at 10px, which is the size the stat labels need to be
for the density this app wants.

Secondary reason: Plex Mono is the same family, so scorecard-style figures are
available without introducing a third typeface.

Both are free and on Google Fonts, so both work with `@expo-google-fonts`.

### Scale

| Token | Size / line | Face |
|---|---|---|
| `score` | 40 / 40 | Archivo Expanded 900 |
| `bout` | 22 / 26 | Archivo Expanded 800 |
| `title` | 17 / 22 | Archivo Expanded 700 |
| `body` | 14 / 20 | Plex Sans 400 |
| `stat` | 14 / 18 | Plex Sans 600, tabular |
| `label` | 10 / 14 | Plex Sans 600, +0.08em, uppercase |

Six sizes. Anything not on this scale is a bug.

---

## 3. Signature element — the round lane

### The problem it solves

A pick is three decisions: **who** wins, **how**, and **in which round**.
Today that is three unrelated controls stacked vertically — a fighter row, a
method chip row, a round chip row. Nothing about that arrangement is specific
to fighting; it is a form. Any sports app would produce it.

### The element

One horizontal lane representing the actual fight, divided into its real
rounds — three cells for a standard bout, five for a main event — with a final
`DEC` cell at the end.

```
  RED    ┌─────┬─────┬─────┬─────┬─────┬─────┐
  Pereira│  1  │  2  │  3  │  4  │  5  │ DEC │
         ├─────┼─────┼─────┼─────┼─────┼─────┤
  Hill   │  1  │  2  │  3  │  4  │  5  │ DEC │
  BLUE   └─────┴─────┴─────┴─────┴─────┴─────┘
```

Two rails, one per corner, tinted `cornerRed` and `cornerBlue`. You place a
single marker in one cell. That one placement encodes all three decisions:

- **Which rail** → who wins
- **Which column** → which round, or a decision
- **A two-state toggle on the marker** → KO/TKO or submission (suppressed in
  the `DEC` column, where method is not a choice)

The lane reads back as a sentence underneath: *"Pereira by KO/TKO in Round 2."*

### Why this is worth building

**It is the shape of a fight.** A bout is a timeline that ends somewhere. Chip
rows are not; a timeline is. Placing a marker on round 2 is closer to the thing
being predicted than selecting "2" from a list.

**One element, three jobs, and it persists.** After the bout is scored, the same
lane shows the real finish next to your marker. The control becomes the result
display without redrawing anything — you see how close you were on the object
you used to guess.

**It solves head-to-head.** In a matchup, your opponent's marker appears on the
same lane. Two picks on one fight timeline shows agreement, disagreement, and
distance at a glance. Two separate pick summaries side by side never will.

**It scales down.** Collapsed to a single row on the undercard list, the lane
becomes a compact readout — a filled cell at the round you chose, tinted by
corner. Same object, less space.

### Input

Tap-first: tap a cell to place, tap again to toggle method. Drag along the lane
is a refinement to add after the tap version works, not a requirement — drag is
harder to make accessible and should not gate the feature.

---

## 4. What this replaces

| Current | Replaced by |
|---|---|
| Bebas Neue for all display | Archivo Expanded 700–900 |
| System/default body font | IBM Plex Sans |
| `red: #E8003D` as sole accent | `cornerRed` / `cornerBlue` as assignments, `belt` for outcomes |
| Rounded cards at 14–18px throughout | Flat rows on `fence`, hairlines in `seam`, 8px reserved for settled results |
| Fighter row + method chips + round chips | The round lane |

Retained: the entire motion layer — `PressableScale`, `useToggleProgress`,
`AnimatedBar`, `popIn`, entrance stagger. That work is orthogonal to visual
direction and does not need redoing.

---

## 5. Open questions

- **Bout length.** The lane needs to know if a fight is 3 or 5 rounds. Not
  currently in the `Fight` type; needs adding before the lane can be built.
- **Colour-blind users.** Red/blue corner is the real-world convention but
  red-green and blue-yellow deficiencies affect the pairing. The corner label
  (`RED` / `BLUE`) must be present as text, and marker shape should differ per
  rail, so colour is never the only channel carrying corner identity.
- **Empty states.** The app currently ships the new-user state. Every screen
  above assumes populated data; the empty treatment needs designing in this
  language, not bolted on.
