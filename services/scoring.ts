/*
 * Scoring — the rulebook, as a pure function.
 *
 * No database, no network, no clock. `(pick, result) -> points + breakdown`
 * and nothing else. Two reasons this matters:
 *
 *   1. Results get corrected. Overturned decisions, No Contests, a fight
 *      re-ruled days later. Re-running scoring over an event has to be safe
 *      and give a clean answer, which it only is if scoring reads nothing and
 *      writes nothing.
 *   2. Every combination is testable without standing anything up.
 *
 * The point values are not an implementation detail — they are published to
 * the user in app/league-settings.tsx. Changing them here without changing
 * them there makes the app lie.
 */

import type { Corner, Finish, LanePick, Method } from "../components/RoundLane";

/* ------------------------------------------------------------------ *
 * Rulebook
 * ------------------------------------------------------------------ */

export const POINTS = {
  winner: 100,
  method: 50,
  round: 30,
} as const;

/** Applied to the full earned total, not just the winner points. */
export const UNDERDOG_MULTIPLIER = 1.5;

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

/**
 * How a bout actually ended.
 *
 * `method` is deliberately wider than the pick-side `Method` ("KO" | "SUB"):
 * a bout can end in a decision, and a decision is a method for scoring
 * purposes. See METHOD RULING below.
 */
export type ResultMethod = Method | "DEC";

/**
 * Outcomes where nobody scores. Kept as a union rather than a boolean so the
 * ingestion layer records *why* a bout voided — it shows up in history, and
 * "No Contest" and "cancelled" read differently to a user.
 */
export type VoidReason = "NC" | "DRAW" | "CANCELLED";

export type BoutResult =
  | {
      status: "scored";
      winner: Corner;
      method: ResultMethod;
      /**
       * The round the fight ended in. Absent on decisions — a decision ends
       * when the scheduled rounds run out, so there is no round to call.
       */
      round?: number;
    }
  | {
      status: "void";
      reason: VoidReason;
    };

/* ------------------------------------------------------------------ *
 * Score
 * ------------------------------------------------------------------ */

/**
 * Every line that made up a score, kept so the UI can show the breakdown
 * rather than an unexplained number. app/history.tsx already displays scores
 * per-bout; this is what feeds it.
 */
export type ScoreBreakdown = {
  winner: number;
  method: number;
  round: number;
  /** Points added by the underdog multiplier. 0 when it didn't apply. */
  underdogBonus: number;
};

export type Score = {
  points: number;
  breakdown: ScoreBreakdown;
  /**
   * Whether this bout counts toward the user's accuracy percentage.
   *
   * Void bouts are excluded entirely — being on the wrong side of a No Contest
   * is not a bad pick, and shouldn't drag a percentage down. An unpicked bout
   * is likewise not a miss; you can't be wrong about a fight you passed on.
   */
  countsForAccuracy: boolean;
  /** True when the winner was called correctly. Drives accuracy. */
  correct: boolean;
};

const ZERO_BREAKDOWN: ScoreBreakdown = {
  winner: 0,
  method: 0,
  round: 0,
  underdogBonus: 0,
};

function voidScore(): Score {
  return {
    points: 0,
    breakdown: { ...ZERO_BREAKDOWN },
    countsForAccuracy: false,
    correct: false,
  };
}

function missScore(): Score {
  return {
    points: 0,
    breakdown: { ...ZERO_BREAKDOWN },
    countsForAccuracy: true,
    correct: false,
  };
}

/* ------------------------------------------------------------------ *
 * The function
 * ------------------------------------------------------------------ */

/**
 * Score one pick against one result.
 *
 * @param pick        What the user called. `null` means they passed on this
 *                    bout — legal outside leagues, and at lower tiers.
 * @param result      What happened.
 * @param wasUnderdog Whether the corner the user picked was the underdog *at
 *                    the time the pick was made*. Odds move, so this is stored
 *                    on the pick rather than looked up now — scoring must be
 *                    reproducible months later.
 */
export function scorePick(
  pick: LanePick | null | undefined,
  result: BoutResult,
  wasUnderdog = false
): Score {
  // VOID RULING: nobody scores, and the bout leaves no mark on accuracy.
  // Checked before the null-pick case so a void bout never counts as a miss.
  if (result.status === "void") return voidScore();

  // No pick is not a wrong pick, but it is a bout you could have played.
  // Points 0, and it does not enter the accuracy denominator.
  if (!pick) {
    return {
      points: 0,
      breakdown: { ...ZERO_BREAKDOWN },
      countsForAccuracy: false,
      correct: false,
    };
  }

  // Wrong corner ends it. Method and round points are refinements *on top of*
  // a correct winner — there is no consolation for calling the finish of a
  // fight you had going the other way.
  if (pick.corner !== result.winner) return missScore();

  const breakdown: ScoreBreakdown = { ...ZERO_BREAKDOWN };
  breakdown.winner = POINTS.winner;

  // METHOD RULING: "DEC" is a method worth the full +50.
  //
  // It lives in `Finish` on the pick side and in `method` on the result side,
  // so the two are compared through this normalisation rather than directly.
  // Calling that a fight goes the distance is a real read, and without this a
  // decision-picker could never earn method points at all.
  const pickedMethod: ResultMethod | undefined =
    pick.finish === "DEC" ? "DEC" : pick.method;

  if (pickedMethod && pickedMethod === result.method) {
    breakdown.method = POINTS.method;
  }

  // ANY RULING: "he gets finished, I won't say when" forfeits round points.
  //
  // ANY is a genuine confidence level (see the Finish type), not a lazy pick —
  // but it declines to name a round, so it cannot collect for naming one.
  // A numeric finish is the only thing that can earn round points, and only
  // when the fight actually ended inside the distance in that round.
  if (
    typeof pick.finish === "number" &&
    result.method !== "DEC" &&
    result.round === pick.finish
  ) {
    breakdown.round = POINTS.round;
  }

  const base = breakdown.winner + breakdown.method + breakdown.round;

  // UNDERDOG RULING: the multiplier applies to the full earned total, so
  // precision on an upset compounds rather than being flat-rated.
  let points = base;
  if (wasUnderdog) {
    points = base * UNDERDOG_MULTIPLIER;
    breakdown.underdogBonus = points - base;
  }

  return { points, breakdown, countsForAccuracy: true, correct: true };
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

export type ScoredBout = {
  score: Score;
};

/**
 * Roll scored bouts into the two numbers the standings need.
 *
 * Accuracy is deliberately separate from points: points measure volume, so
 * ranking on points alone rewards someone picking every bout on every card
 * over someone picking five and hitting all five. The global table shows both.
 */
export function summarise(bouts: ScoredBout[]) {
  let points = 0;
  let correct = 0;
  let counted = 0;

  for (const { score } of bouts) {
    points += score.points;
    if (score.countsForAccuracy) {
      counted += 1;
      if (score.correct) correct += 1;
    }
  }

  return {
    points,
    correct,
    /** Bouts that counted — the accuracy denominator. */
    counted,
    /** 0–1, or null when nothing has been scored yet. Never divide by zero. */
    accuracy: counted === 0 ? null : correct / counted,
  };
}
