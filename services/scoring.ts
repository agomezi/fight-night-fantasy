/*
 * Scoring — the rulebook, as a pure function.
 *
 * No database, no network, no clock. `(pick, result, context) -> points +
 * breakdown` and nothing else. Two reasons this matters:
 *
 *   1. Results get corrected. Overturned decisions, No Contests, a fight
 *      re-ruled days later. Re-running scoring over an event has to be safe
 *      and give a clean answer, which it only is if scoring reads nothing and
 *      writes nothing.
 *   2. Every combination is testable without standing anything up.
 *
 * The point values are not an implementation detail — they are published to
 * the user by components/ScoringRules.tsx, which reads them from here so the
 * two cannot drift.
 */

import type { Corner, LanePick, Method } from "../components/RoundLane";

/* ------------------------------------------------------------------ *
 * Rulebook
 * ------------------------------------------------------------------ */

/** Earned for a correct call on each line. */
export const POINTS = {
  fighter: 50,
  method: 50,
  round: 25,
} as const;

/**
 * Lost for a wrong call on each line, as positive numbers. Only calls the user
 * actually made can be wrong: an unnamed method or round scores 0, never a
 * deduction, or the deductions would push everyone to minimum-information
 * picks.
 */
export const DEDUCTIONS = {
  fighter: 50,
  method: 30,
  round: 15,
} as const;

/**
 * Method and round still earn when the fighter is wrong — reading the fight
 * is worth something — but at half value, so the best wrong-fighter outcome
 * (-50 + 25 + 12) can never come out positive. Deductions are not halved.
 */
export const WRONG_FIGHTER_EARNINGS = 0.5;

/** Applied to a positive total, never to a deduction. Main card only. */
export const UNDERDOG_MULTIPLIER = 1.5;

export type Tier = "casual" | "amateur" | "pro" | "hardcore";

/**
 * Casual is training-wheels mode: same shape, deductions halved. Every other
 * tier plays full deductions.
 */
const DEDUCTION_SCALE: Record<Tier, number> = {
  casual: 0.5,
  amateur: 1,
  pro: 1,
  hardcore: 1,
};

/**
 * The deductions a tier plays with. Halves round down, so Casual is
 * -25 / -15 / -7 and no fractional points ever reach the UI.
 */
export function deductionsFor(tier: Tier) {
  const scale = DEDUCTION_SCALE[tier];
  return {
    fighter: Math.floor(DEDUCTIONS.fighter * scale),
    method: Math.floor(DEDUCTIONS.method * scale),
    round: Math.floor(DEDUCTIONS.round * scale),
  };
}

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
 * Outcomes where nobody scores. Kept as a union rather than a boolean so
 * history records *why* a bout voided — "No Contest" and "the opponent
 * changed" read very differently to a user.
 *
 * FIGHTER_CHANGED covers a pick made against an earlier version of the bout:
 * a replacement opponent makes it a different bet, so it is voided for both
 * sides rather than silently transferred.
 */
export type VoidReason = "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED";

/**
 * The feed corrects itself in the minutes after a fight, so a result is
 * provisional until marked final. Scores carry the same flag through.
 */
export type ResultStatus = "provisional" | "final";

export type BoutResult =
  | {
      /** No result yet — the bout hasn't happened or hasn't ended. */
      status: "pending";
    }
  | {
      status: "scored";
      winner: Corner;
      method: ResultMethod;
      /**
       * The round the fight ended in. Absent on decisions — a decision ends
       * when the scheduled rounds run out, so there is no round to call.
       */
      round?: number;
      /** Defaults to final. */
      finality?: ResultStatus;
    }
  | {
      status: "void";
      reason: VoidReason;
      finality?: ResultStatus;
    };

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

export type CardSegment = "main" | "prelims" | "early_prelims";

/**
 * Everything about the bout and league that scoring needs beyond the pick and
 * the result. All of it is stored, never looked up at scoring time.
 */
export type ScoreContext = {
  /** The league's tier. Outside leagues, play full deductions. */
  tier?: Tier;
  /** Where the bout sat on the card. The underdog bonus is main card only. */
  segment?: CardSegment;
  /**
   * The underdog corner, snapshotted on the bout when the event started.
   * Odds move, so scoring must not look them up again.
   */
  underdogCorner?: Corner | null;
};

/* ------------------------------------------------------------------ *
 * Score
 * ------------------------------------------------------------------ */

/**
 * Every line that made up a score, kept so the UI can show the breakdown
 * rather than an unexplained number. Lines are signed: a deduction is negative.
 */
export type ScoreBreakdown = {
  fighter: number;
  method: number;
  round: number;
  /** Points added by the underdog multiplier. 0 when it didn't apply. */
  underdogBonus: number;
};

/**
 * pending      — no result yet; 0 points, out of accuracy.
 * provisional  — scored against a result the feed may still correct.
 * final        — scored against the settled result.
 */
export type ScoreState = "pending" | ResultStatus;

export type Score = {
  points: number;
  breakdown: ScoreBreakdown;
  state: ScoreState;
  /**
   * Whether this bout counts toward the user's accuracy percentage.
   *
   * Void bouts are excluded entirely — being on the wrong side of a No Contest
   * is not a bad pick, and shouldn't drag a percentage down. An unpicked bout
   * is likewise not a miss; you can't be wrong about a fight you passed on.
   */
  countsForAccuracy: boolean;
  /** True when the fighter was called correctly. Drives accuracy. */
  correct: boolean;
};

const ZERO_BREAKDOWN: ScoreBreakdown = {
  fighter: 0,
  method: 0,
  round: 0,
  underdogBonus: 0,
};

function emptyScore(state: ScoreState): Score {
  return {
    points: 0,
    breakdown: { ...ZERO_BREAKDOWN },
    state,
    countsForAccuracy: false,
    correct: false,
  };
}

/* ------------------------------------------------------------------ *
 * The function
 * ------------------------------------------------------------------ */

/**
 * Score one pick against one result.
 *
 * @param pick    What the user called. `null` means they passed on this bout —
 *                legal outside leagues, and at lower tiers.
 * @param result  What happened, or `pending` if nothing has yet.
 * @param context Tier, card segment and the underdog snapshot.
 */
export function scorePick(
  pick: LanePick | null | undefined,
  result: BoutResult,
  context: ScoreContext = {}
): Score {
  if (result.status === "pending") return emptyScore("pending");

  const state: ResultStatus = result.finality ?? "final";

  // VOID RULING: nobody scores, and the bout leaves no mark on accuracy.
  // Checked before the null-pick case so a void bout never counts as a miss.
  if (result.status === "void") return emptyScore(state);

  // No pick is not a wrong pick. Points 0, out of the accuracy denominator.
  if (!pick) return emptyScore(state);

  const tier = context.tier ?? "pro";
  const deductions = deductionsFor(tier);
  const correct = pick.corner === result.winner;

  // HALF-CREDIT RULING: a wrong fighter still earns for reading the fight,
  // at half value, rounded down. Deductions stay whole either way. Casual
  // scales these earnings with its deductions — otherwise its halved fighter
  // penalty (-25) would be covered by full half-credit (25 + 12) and a wrong
  // fighter could profit.
  const wrongFighterScale = WRONG_FIGHTER_EARNINGS * DEDUCTION_SCALE[tier];
  const earn = (points: number) =>
    correct ? points : Math.floor(points * wrongFighterScale);

  const breakdown: ScoreBreakdown = { ...ZERO_BREAKDOWN };
  breakdown.fighter = correct ? POINTS.fighter : -deductions.fighter;

  // METHOD RULING: "DEC" is a method worth the full +50.
  //
  // It lives in `Finish` on the pick side and in `method` on the result side,
  // so the two are compared through this normalisation rather than directly.
  // Calling that a fight goes the distance is a real read, and without this a
  // decision-picker could never earn method points at all.
  const pickedMethod: ResultMethod | undefined =
    pick.finish === "DEC" ? "DEC" : pick.method;

  if (pickedMethod) {
    breakdown.method =
      pickedMethod === result.method
        ? earn(POINTS.method)
        : -deductions.method;
  }

  // ANY RULING: "he gets finished, I won't say when" forfeits the round line
  // in both directions — it cannot collect for a round it didn't name, and
  // it cannot be deducted for one either. Only a numeric finish is a round
  // call, and it is right only if the fight ended inside the distance in
  // that round. A named round on a fight that went the distance is wrong.
  if (typeof pick.finish === "number") {
    const hit = result.method !== "DEC" && result.round === pick.finish;
    breakdown.round = hit ? earn(POINTS.round) : -deductions.round;
  }

  const base = breakdown.fighter + breakdown.method + breakdown.round;

  // UNDERDOG RULING: the multiplier applies to the full total, so precision
  // on an upset compounds — but only when that total is positive, and only on
  // the main card. It never amplifies a loss.
  let points = base;
  if (
    base > 0 &&
    context.segment === "main" &&
    context.underdogCorner != null &&
    context.underdogCorner === pick.corner
  ) {
    points = Math.floor(base * UNDERDOG_MULTIPLIER);
    breakdown.underdogBonus = points - base;
  }

  return { points, breakdown, state, countsForAccuracy: true, correct };
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

export type ScoredBout = {
  score: Score;
};

/**
 * Roll scored bouts into the numbers the standings need.
 *
 * Accuracy is deliberately separate from points: points measure volume, so
 * ranking on points alone rewards someone picking every bout on every card
 * over someone picking five and hitting all five. The global table shows both.
 */
export function summarise(bouts: ScoredBout[]) {
  let points = 0;
  let correct = 0;
  let counted = 0;
  let pending = 0;
  let provisional = 0;

  for (const { score } of bouts) {
    points += score.points;
    if (score.state === "pending") pending += 1;
    if (score.state === "provisional") provisional += 1;
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
    /** Bouts still waiting on a result. */
    pending,
    /**
     * Bouts scored against a result that may still change. Any provisional
     * bout makes the total provisional.
     */
    provisional,
  };
}
