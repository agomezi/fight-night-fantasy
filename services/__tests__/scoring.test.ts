/*
 * The rulebook, asserted.
 *
 * These tests are the specification — if a rule changes, it changes here
 * first. Totals are written as literal numbers rather than sums of the
 * constants, so a change to POINTS or DEDUCTIONS fails loudly here instead of
 * quietly carrying the tests along with it.
 */

import type { LanePick } from "../../components/RoundLane";
import {
  POINTS,
  deductionsFor,
  scorePick,
  summarise,
  type BoutResult,
  type ScoreContext,
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

/** Red is the underdog on a main-card bout. */
const redUnderdogMain: ScoreContext = { segment: "main", underdogCorner: "red" };

describe("every combination (full deductions)", () => {
  // The rulebook's two tables, row for row, against KO in round 2.
  it.each([
    ["fighter only", { corner: "red", finish: "ANY" }, 50],
    ["fighter + method, method right", { corner: "red", finish: "ANY", method: "KO" }, 100],
    ["fighter + method, method wrong", { corner: "red", finish: "ANY", method: "SUB" }, 20],
    ["all three right", { corner: "red", finish: 2, method: "KO" }, 125],
    ["method wrong, round right", { corner: "red", finish: 2, method: "SUB" }, 45],
    ["method right, round wrong", { corner: "red", finish: 3, method: "KO" }, 85],
    ["method wrong, round wrong", { corner: "red", finish: 3, method: "SUB" }, 5],
  ] as const)("fighter right — %s scores %i", (_, p, total) => {
    const s = scorePick(pick(p), koRound2);
    expect(s.points).toBe(total);
    expect(s.correct).toBe(true);
    expect(s.countsForAccuracy).toBe(true);
  });

  it.each([
    ["fighter only", { corner: "blue", finish: "ANY" }, -50],
    ["fighter + method, method right", { corner: "blue", finish: "ANY", method: "KO" }, -25],
    ["fighter + method, method wrong", { corner: "blue", finish: "ANY", method: "SUB" }, -80],
    ["method + round right", { corner: "blue", finish: 2, method: "KO" }, -13],
    ["all wrong", { corner: "blue", finish: 3, method: "SUB" }, -95],
  ] as const)("fighter wrong — %s scores %i", (_, p, total) => {
    const s = scorePick(pick(p), koRound2);
    expect(s.points).toBe(total);
    expect(s.correct).toBe(false);
    expect(s.countsForAccuracy).toBe(true);
  });
});

describe("half credit on a wrong fighter", () => {
  it("halves earnings, rounding down: method 25, round 12", () => {
    const s = scorePick(pick({ corner: "blue", finish: 2, method: "KO" }), koRound2);
    expect(s.breakdown).toEqual({ fighter: -50, method: 25, round: 12, underdogBonus: 0 });
  });

  it("does not halve deductions", () => {
    const s = scorePick(pick({ corner: "blue", finish: 3, method: "SUB" }), koRound2);
    expect(s.breakdown).toEqual({ fighter: -50, method: -30, round: -15, underdogBonus: 0 });
  });

  it.each(["casual", "amateur", "pro", "hardcore"] as const)(
    "never lets a wrong fighter profit (%s)",
    (tier) => {
      const best = scorePick(
        pick({ corner: "blue", finish: 2, method: "KO" }),
        koRound2,
        { tier, ...redUnderdogMain, underdogCorner: "blue" }
      );
      expect(best.points).toBeLessThan(0);
    }
  );
});

describe("only calls you made are judged", () => {
  it("deducts nothing for a method that was never named", () => {
    const s = scorePick(pick({ corner: "red", finish: 2 }), koRound2);
    expect(s.breakdown.method).toBe(0);
    expect(s.points).toBe(75);
  });

  it("deducts nothing for a round ANY declined to name", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY", method: "SUB" }), koRound2);
    expect(s.breakdown.round).toBe(0);
  });

  it("does not treat ANY with no method as a call that the fight is finished", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), decision);
    expect(s.points).toBe(50);
  });
});

describe("decisions", () => {
  // DEC RULING
  it("treats a correct DEC as a method worth the full +50", () => {
    const s = scorePick(pick({ corner: "red", finish: "DEC" }), decision);
    expect(s.breakdown.method).toBe(POINTS.method);
    expect(s.points).toBe(100);
  });

  it("deducts the method when DEC is called and the fight is finished", () => {
    const s = scorePick(pick({ corner: "red", finish: "DEC" }), koRound2);
    expect(s.breakdown).toEqual({ fighter: 50, method: -30, round: 0, underdogBonus: 0 });
  });

  it("deducts method and round for a finish call that goes the distance", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), decision);
    expect(s.points).toBe(5);
  });

  it("deducts a named round on a decision even with no method named", () => {
    const s = scorePick(pick({ corner: "red", finish: 3 }), decision);
    expect(s.breakdown.round).toBe(-15);
    expect(s.points).toBe(35);
  });

  it("half-credits a correct DEC call on the wrong fighter", () => {
    const s = scorePick(pick({ corner: "blue", finish: "DEC" }), decision);
    expect(s.points).toBe(-25);
  });
});

describe("tiers", () => {
  it("plays Casual at half deductions: -25 / -15 / -7", () => {
    expect(deductionsFor("casual")).toEqual({ fighter: 25, method: 15, round: 7 });
    const s = scorePick(pick({ corner: "blue", finish: 3, method: "SUB" }), koRound2, {
      tier: "casual",
    });
    expect(s.points).toBe(-47);
  });

  it("keeps Casual earnings whole when the fighter is right", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2, {
      tier: "casual",
    });
    expect(s.points).toBe(125);
  });

  it("caps Casual's best wrong-fighter outcome at -7", () => {
    const s = scorePick(pick({ corner: "blue", finish: 2, method: "KO" }), koRound2, {
      tier: "casual",
    });
    expect(s.breakdown).toEqual({ fighter: -25, method: 12, round: 6, underdogBonus: 0 });
    expect(s.points).toBe(-7);
  });

  it.each(["amateur", "pro", "hardcore"] as const)("plays %s at full deductions", (tier) => {
    expect(deductionsFor(tier)).toEqual({ fighter: 50, method: 30, round: 15 });
  });

  it("defaults to full deductions outside a league", () => {
    const s = scorePick(pick({ corner: "blue", finish: "ANY" }), koRound2);
    expect(s.points).toBe(-50);
  });
});

describe("underdog multiplier", () => {
  it("multiplies the complete stack, rounding down", () => {
    const s = scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2, redUnderdogMain);
    expect(s.points).toBe(187); // 125 x 1.5 = 187.5
    expect(s.breakdown.underdogBonus).toBe(62);
  });

  it("multiplies a net total that includes deductions, while it stays positive", () => {
    const s = scorePick(pick({ corner: "red", finish: 3, method: "SUB" }), koRound2, redUnderdogMain);
    expect(s.points).toBe(7); // +5 x 1.5
  });

  it("never amplifies a loss", () => {
    const s = scorePick(pick({ corner: "blue", finish: 3, method: "SUB" }), koRound2, {
      segment: "main",
      underdogCorner: "blue",
    });
    expect(s.points).toBe(-95);
    expect(s.breakdown.underdogBonus).toBe(0);
  });

  it.each(["prelims", "early_prelims"] as const)("does not apply on the %s", (segment) => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, {
      segment,
      underdogCorner: "red",
    });
    expect(s.points).toBe(50);
  });

  it("adds no bonus when the pick was the favourite", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, {
      segment: "main",
      underdogCorner: "blue",
    });
    expect(s.breakdown.underdogBonus).toBe(0);
  });

  it("adds no bonus when no underdog was snapshotted", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, {
      segment: "main",
      underdogCorner: null,
    });
    expect(s.points).toBe(50);
  });

  it("is the same in every tier", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), koRound2, {
      ...redUnderdogMain,
      tier: "casual",
    });
    expect(s.points).toBe(75);
  });
});

describe("void bouts", () => {
  // VOID RULING: no points, and no mark on accuracy either way.
  it.each(["NC", "DRAW", "CANCELLED", "FIGHTER_CHANGED"] as const)(
    "scores 0 and leaves accuracy untouched for %s",
    (reason) => {
      const s = scorePick(pick({ corner: "blue", finish: 3, method: "SUB" }), {
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

describe("result state", () => {
  it("scores a pending bout as 0, out of accuracy", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), { status: "pending" });
    expect(s.state).toBe("pending");
    expect(s.points).toBe(0);
    expect(s.countsForAccuracy).toBe(false);
  });

  it("carries a provisional result through to the score", () => {
    const s = scorePick(pick({ corner: "red", finish: "ANY" }), {
      ...koRound2,
      finality: "provisional",
    } as BoutResult);
    expect(s.state).toBe("provisional");
    expect(s.points).toBe(50);
  });

  it("treats a result with no finality as final", () => {
    expect(scorePick(pick({ corner: "red", finish: "ANY" }), koRound2).state).toBe("final");
  });

  it("marks a provisional void as provisional", () => {
    const s = scorePick(null, { status: "void", reason: "NC", finality: "provisional" });
    expect(s.state).toBe("provisional");
  });

  it("re-scores cleanly when a provisional result is corrected", () => {
    // Called a red KO in round 2; the feed first had blue, then corrected.
    const p = pick({ corner: "red", finish: 2, method: "KO" });
    const before = scorePick(p, { status: "scored", winner: "blue", method: "KO", round: 2, finality: "provisional" });
    const after = scorePick(p, koRound2);
    expect(before.points).toBe(-13);
    expect(after.points).toBe(125);
    expect(after.state).toBe("final");
  });
});

describe("purity", () => {
  it("returns the same answer every time for the same input", () => {
    const p = pick({ corner: "red", finish: 2, method: "KO" });
    expect(scorePick(p, koRound2, redUnderdogMain)).toEqual(scorePick(p, koRound2, redUnderdogMain));
  });

  it("does not mutate its inputs", () => {
    const p = pick({ corner: "red", finish: 2, method: "KO" });
    const ctx: ScoreContext = { ...redUnderdogMain, tier: "casual" };
    const snapshot = JSON.stringify([p, koRound2, ctx]);
    scorePick(p, koRound2, ctx);
    expect(JSON.stringify([p, koRound2, ctx])).toBe(snapshot);
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
      { score: scorePick(pick({ corner: "red", finish: 2, method: "KO" }), koRound2) }, // 125, hit
      { score: scorePick(pick({ corner: "blue", finish: 1 }), koRound2) }, // -65, miss
      { score: scorePick(pick({ corner: "red", finish: 1 }), { status: "void", reason: "NC" }) }, // void
      { score: scorePick(null, koRound2) }, // no pick
    ];
    const s = summarise(bouts);

    expect(s.points).toBe(60);
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

  it("counts pending and provisional bouts", () => {
    const p = pick({ corner: "red", finish: "ANY" });
    const s = summarise([
      { score: scorePick(p, koRound2) },
      { score: scorePick(p, { ...koRound2, finality: "provisional" } as BoutResult) },
      { score: scorePick(p, { status: "pending" }) },
      { score: scorePick(p, { status: "pending" }) },
    ]);
    expect(s.pending).toBe(2);
    expect(s.provisional).toBe(1);
    expect(s.points).toBe(100);
    expect(s.counted).toBe(2);
  });

  it("prices volume: a wrong pick now costs points", () => {
    // Under deductions, picking everything is no longer free. Five hits and
    // twenty misses is a heavy net loss, where five hits alone is +250.
    const perfect = Array.from({ length: 5 }, () => ({
      score: scorePick(pick({ corner: "red", finish: "ANY" }), koRound2),
    }));
    const prolific = [
      ...perfect,
      ...Array.from({ length: 20 }, () => ({
        score: scorePick(pick({ corner: "blue", finish: "ANY" }), koRound2),
      })),
    ];

    expect(summarise(perfect).points).toBe(250);
    expect(summarise(prolific).points).toBe(-750);
    expect(summarise(prolific).accuracy).toBe(0.2);
  });
});
