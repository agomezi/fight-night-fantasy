/*
 * The rulebook, asserted.
 *
 * These tests are the specification — if a rule changes, it changes here
 * first and in app/league-settings.tsx second. Every branch of scorePick is
 * covered, including the three cases the UI can express but the published
 * four-line rulebook does not spell out: ANY finishes, DEC as a method, and
 * what the underdog multiplier multiplies.
 */

import type { LanePick } from "../../components/RoundLane";
import {
  POINTS,
  UNDERDOG_MULTIPLIER,
  scorePick,
  summarise,
  type BoutResult,
} from "../scoring";

/** Red wins by KO in round 2 — the workhorse result for most cases. */
const koRound2: BoutResult = {
  status: "scored",
  winner: "red",
  method: "KO",
  round: 2,
};

const decision: BoutResult = {
  status: "scored",
  winner: "red",
  method: "DEC",
};

const pick = (p: LanePick) => p;

describe("winner", () => {
  it("pays +100 for the right corner", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2);
    expect(s.breakdown.winner).toBe(POINTS.winner);
    expect(s.correct).toBe(true);
  });

  it("pays nothing at all for the wrong corner, even with method and round right", () => {
    // Blue was picked to win by KO in round 2. The KO in round 2 happened —
    // to the other guy. Refinements never survive a wrong winner.
    const s = scorePick(
      pick({ corner: "blue", finish: 2, method: "KO" }),
      koRound2
    );
    expect(s.points).toBe(0);
    expect(s.breakdown.method).toBe(0);
    expect(s.breakdown.round).toBe(0);
    expect(s.correct).toBe(false);
    expect(s.countsForAccuracy).toBe(true);
  });
});

describe("method", () => {
  it("pays +50 when KO is called and KO happens", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2);
    expect(s.breakdown.method).toBe(POINTS.method);
  });

  it("pays nothing when SUB is called and KO happens", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "SUB" }), koRound2);
    expect(s.breakdown.method).toBe(0);
    // Round was still called correctly, so that half stands on its own.
    expect(s.breakdown.round).toBe(POINTS.round);
  });

  it("pays nothing when no method was called at all", () => {
    // "Pereira to win" — a complete pick, but it claims no method.
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2);
    expect(s.breakdown.method).toBe(0);
    expect(s.points).toBe(POINTS.winner);
  });

  // DEC RULING
  it("treats a correct DEC as a method worth the full +50", () => {
    const s = scorePick(pick({ corner: "red", finish: "DEC" }), decision);
    expect(s.breakdown.method).toBe(POINTS.method);
    expect(s.points).toBe(POINTS.winner + POINTS.method);
  });

  it("pays no method points for DEC when the fight is finished instead", () => {
    const s = scorePick(pick({ corner: "red", finish: "DEC" }), koRound2);
    expect(s.breakdown.method).toBe(0);
    expect(s.breakdown.round).toBe(0);
    expect(s.points).toBe(POINTS.winner);
  });

  it("pays no method points for a finish call when it goes to the judges", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), decision);
    expect(s.breakdown.method).toBe(0);
    expect(s.points).toBe(POINTS.winner);
  });
});

describe("round", () => {
  it("pays +30 for the right round", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2);
    expect(s.breakdown.round).toBe(POINTS.round);
    expect(s.points).toBe(POINTS.winner + POINTS.method + POINTS.round);
  });

  it("pays nothing for the wrong round", () => {
    const s = scorePick(pick({ corner: "red", finish: 3, method: "KO" }), koRound2);
    expect(s.breakdown.round).toBe(0);
    expect(s.points).toBe(POINTS.winner + POINTS.method);
  });

  // ANY RULING — the case the published rulebook never addressed.
  it("pays method but NOT round for an ANY finish", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY", method: "KO" }), koRound2);
    expect(s.breakdown.method).toBe(POINTS.method);
    expect(s.breakdown.round).toBe(0);
    expect(s.points).toBe(POINTS.winner + POINTS.method);
  });

  it("never pays round points on a decision", () => {
    // A decision has no round to call, so a numeric pick cannot match it.
    const s = scorePick(pick({ corner: "red", finish: 3 }), decision);
    expect(s.breakdown.round).toBe(0);
  });
});

describe("underdog multiplier", () => {
  // UNDERDOG RULING: multiplies the full earned total, not the winner alone.
  it("multiplies the complete stack", () => {
    const s = scorePick(
      pick({ corner: "red", finish: 2, method: "KO" }),
      koRound2,
      true
    );
    const base = POINTS.winner + POINTS.method + POINTS.round; // 180
    expect(s.points).toBe(base * UNDERDOG_MULTIPLIER); // 270
    expect(s.breakdown.underdogBonus).toBe(base * UNDERDOG_MULTIPLIER - base);
  });

  it("multiplies a winner-only pick to 150", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, true);
    expect(s.points).toBe(150);
  });

  it("produces the .5 totals seen in the standings", () => {
    // 100 + 50 = 150, x1.5 = 225. Half-points come from odd stacks like
    // winner + round: (100 + 30) * 1.5 = 195. Confirms the multiplier shape.
    const s = scorePick(pick({ corner: "red", finish: 2, method: "SUB" }), koRound2, true);
    expect(s.points).toBe((POINTS.winner + POINTS.round) * UNDERDOG_MULTIPLIER);
    expect(s.points).toBe(195);
  });

  it("gives a losing underdog pick nothing to multiply", () => {
    const s = scorePick(pick({ corner: "blue", finish: 2 }), koRound2, true);
    expect(s.points).toBe(0);
    expect(s.breakdown.underdogBonus).toBe(0);
  });

  it("adds no bonus when the pick was the favourite", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, false);
    expect(s.breakdown.underdogBonus).toBe(0);
    expect(s.points).toBe(POINTS.winner);
  });
});

describe("void bouts", () => {
  // VOID RULING: no points, and no mark on accuracy either way.
  it.each(["NC", "DRAW", "CANCELLED"] as const)(
    "scores 0 and leaves accuracy untouched for %s",
    (reason) => {
      const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), {
        status: "void",
        reason,
      });
      expect(s.points).toBe(0);
      expect(s.countsForAccuracy).toBe(false);
      expect(s.correct).toBe(false);
    }
  );

  it("voids before considering a missing pick", () => {
    const s = scorePick(null, { status: "void", reason: "NC" });
    expect(s.countsForAccuracy).toBe(false);
  });
});

describe("no pick", () => {
  it("scores 0 without counting as a miss", () => {
    // Passing on a bout is legal outside leagues and at lower tiers. You
    // cannot be wrong about a fight you never called.
    for (const p of [null, undefined]) {
      const s = scorePick(p, koRound2);
      expect(s.points).toBe(0);
      expect(s.correct).toBe(false);
      expect(s.countsForAccuracy).toBe(false);
    }
  });
});

describe("purity", () => {
  it("returns the same answer every time for the same input", () => {
    const p = pick({ corner: "red", finish: 2, method: "KO" });
    const a = scorePick(p, koRound2, true);
    const b = scorePick(p, koRound2, true);
    expect(a).toEqual(b);
  });

  it("does not mutate the pick it is given", () => {
    const p = pick({ corner: "red", finish: 2, method: "KO" });
    const snapshot = JSON.stringify(p);
    scorePick(p, koRound2, true);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it("does not share breakdown objects between calls", () => {
    // Guards the ZERO_BREAKDOWN spread — a shared reference here would let
    // one bout's score leak into another's.
    const a = scorePick(null, koRound2);
    const b = scorePick(null, koRound2);
    expect(a.breakdown).not.toBe(b.breakdown);
  });
});

describe("summarise", () => {
  it("totals points and computes accuracy over counted bouts only", () => {
    const bouts = [
      { score: scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2) }, // 180, hit
      { score: scorePick(pick({ corner: "blue", finish: 1 }), koRound2) }, // 0, miss
      { score: scorePick(pick({ corner: "red", finish: 1 }), { status: "void", reason: "NC" }) }, // void
      { score: scorePick(null, koRound2) }, // no pick
    ];
    const s = summarise(bouts);

    expect(s.points).toBe(180);
    // Only the hit and the miss count — void and unpicked are excluded.
    expect(s.counted).toBe(2);
    expect(s.correct).toBe(1);
    expect(s.accuracy).toBe(0.5);
  });

  it("returns null accuracy rather than dividing by zero", () => {
    expect(summarise([]).accuracy).toBeNull();
    const allVoid = [
      { score: scorePick(pick({ corner: "red", finish: 1 }), { status: "void", reason: "DRAW" }) },
    ];
    expect(summarise(allVoid).accuracy).toBeNull();
    expect(summarise(allVoid).points).toBe(0);
  });

  it("separates volume from precision", () => {
    // The reason global ranking is points + accuracy rather than points alone:
    // a five-for-five picker is beaten on points by someone picking everything.
    const perfect = Array.from({ length: 5 }, () => ({
      score: scorePick(pick({ corner: "red", finish: "ANY" }), koRound2),
    }));
    const prolific = [
      ...perfect,
      ...Array.from({ length: 20 }, () => ({
        score: scorePick(pick({ corner: "blue", finish: "ANY" }), koRound2),
      })),
    ];

    expect(summarise(perfect).accuracy).toBe(1);
    expect(summarise(prolific).accuracy).toBe(0.2);
    // Same points, wildly different quality — hence both numbers in the table.
    expect(summarise(prolific).points).toBe(summarise(perfect).points);
  });
});
