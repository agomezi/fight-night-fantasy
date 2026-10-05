// Scores for a whole card, from database rows to score rows. Pure, so the
// results sync runs it under Deno and the tests run it under jest.
//
// The whole card is re-scored every time and the rows replace what was there.
// Nothing is patched: a corrected result, a late cancellation or a fighter
// swap all come out right because the answer is derived from scratch.

import type { LanePick } from "./pickTypes.ts";
import { scorePick, type BoutResult, type CardSegment, type ScoreBreakdown } from "./scoring.ts";

export type BoutRow = {
  id: string;
  version: number;
  status: "scheduled" | "cancelled";
  red_fighter_id: string;
  blue_fighter_id: string;
  card_segment: CardSegment | null;
  underdog_corner: "red" | "blue" | null;
};

export type ResultRow = {
  bout_id: string;
  status: "provisional" | "final";
  winner_fighter_id: string | null;
  method: "KO" | "SUB" | "DEC" | null;
  round: number | null;
  void_reason: "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED" | null;
};

export type PickRow = {
  user_id: string;
  bout_id: string;
  bout_version: number;
  picked_fighter_id: string;
  finish: "round" | "DEC" | "ANY";
  finish_round: number | null;
  method: "KO" | "SUB" | null;
};

export type ScoreRow = {
  user_id: string;
  bout_id: string;
  points: number;
  /** The same pick at Casual, the only tier whose per-bout points differ. */
  casual_points: number;
  breakdown: ScoreBreakdown;
  correct: boolean;
  counts_for_accuracy: boolean;
  provisional: boolean;
};

function resultFor(bout: BoutRow, row: ResultRow | undefined): BoutResult {
  // A bout called off before it happened voids every pick on it.
  if (bout.status === "cancelled") return { status: "void", reason: "CANCELLED" };
  if (!row) return { status: "pending" };
  const finality = row.status;
  if (row.void_reason) return { status: "void", reason: row.void_reason, finality };
  if (!row.winner_fighter_id || !row.method) return { status: "pending" };
  return {
    status: "scored",
    winner: row.winner_fighter_id === bout.red_fighter_id ? "red" : "blue",
    method: row.method,
    ...(row.round == null ? {} : { round: row.round }),
    finality,
  };
}

function pickFor(bout: BoutRow, row: PickRow): LanePick {
  return {
    corner: row.picked_fighter_id === bout.red_fighter_id ? "red" : "blue",
    finish: row.finish === "round" ? (row.finish_round ?? "ANY") : row.finish,
    ...(row.method ? { method: row.method } : {}),
  };
}

/**
 * Every pick's score on the card. Bouts with no result yet produce no row;
 * a score row exists only once there is something to score against.
 *
 * Global scores play full deductions. Casual halves them, so its points are
 * stored beside the full ones; every other tier scores a bout the same and
 * differs only in the season ledger, which league standings replay.
 */
export function scoreEvent(bouts: BoutRow[], results: ResultRow[], picks: PickRow[]): ScoreRow[] {
  const boutsById = new Map(bouts.map(b => [b.id, b]));
  const resultsByBout = new Map(results.map(r => [r.bout_id, r]));
  const rows: ScoreRow[] = [];

  for (const pick of picks) {
    const bout = boutsById.get(pick.bout_id);
    if (!bout) continue;
    let result = resultFor(bout, resultsByBout.get(bout.id));
    if (result.status === "pending") continue;

    // Made against an earlier pairing: the opponent changed, so it is a
    // different bet and is voided rather than scored against someone new.
    if (pick.bout_version !== bout.version && result.status === "scored") {
      result = { status: "void", reason: "FIGHTER_CHANGED", finality: result.finality };
    }

    const lanePick = pickFor(bout, pick);
    const context = {
      segment: bout.card_segment ?? undefined,
      underdogCorner: bout.underdog_corner,
    };
    const score = scorePick(lanePick, result, { ...context, tier: "pro" });
    const casual = scorePick(lanePick, result, { ...context, tier: "casual" });
    rows.push({
      user_id: pick.user_id,
      bout_id: pick.bout_id,
      points: score.points,
      casual_points: casual.points,
      breakdown: score.breakdown,
      correct: score.correct,
      counts_for_accuracy: score.countsForAccuracy,
      provisional: score.state === "provisional",
    });
  }

  return rows;
}
