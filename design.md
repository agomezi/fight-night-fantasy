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

A single placement encodes all three decisions:

- **which rail** → who wins
- **which column** → which round, or a decision
- **the method toggle** → KO/TKO or submission, suppressed on `DEC` where
  method is not a choice

The lane reads back as a sentence: *"Pereira by KO/TKO in Round 2."*

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
