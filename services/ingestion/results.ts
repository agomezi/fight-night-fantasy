// Live results from the UFC stats feed, for the results sync. Pure, and its
// only import is dependency-free, so the Edge Function loads it under Deno.
//
// Two rules from watching a live card decide how this reads the feed:
//
//   1. A result is usable as soon as `Result.Method` is set. The bout's status
//      can still read "Live" or "Over" for ten minutes after that, so waiting
//      for "Final" would make every result ten minutes late.
//   2. Until the bout reads "Final" the result is provisional. The feed has
//      corrected a round within three minutes of first publishing it.

import { normalizeMethod, type ResultMethod, type VoidReason } from "./methods.ts";

export type LiveStatus = "scheduled" | "live" | "complete";

export type LiveResult = {
  /** False until the feed marks the bout Final. */
  final: boolean;
  /** Null on a void result. */
  winnerUfcFighterId: string | null;
  method: ResultMethod | null;
  /** Null on decisions and voids: there is no round to call. */
  round: number | null;
  time: string | null;
  voidReason: VoidReason | null;
  /** The feed's own fields, kept so a result can be re-derived later. */
  raw: Record<string, unknown>;
};

export type LiveBout = {
  ufcFightId: string;
  status: LiveStatus;
  /** Null while the bout has no usable result. */
  result: LiveResult | null;
  /** Set when a result was present but could not be trusted; held pending. */
  issues?: string[];
};

export type LiveCard = {
  ufcEventId: string;
  status: LiveStatus;
  /** The bout in the cage right now, from walkout until the result. */
  liveFightId: string | null;
  bouts: LiveBout[];
};

// "Over" is the gap between a result and "Final"; both mean the fight is done.
const STATUSES: Record<string, LiveStatus> = { Upcoming: "scheduled", Live: "live", Over: "complete", Final: "complete" };

type Json = Record<string, unknown>;
function object(value: unknown, what: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected ${what} to be an object`);
  return value as Json;
}
function id(value: unknown, what: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  throw new Error(`Missing ${what}`);
}
function status(value: unknown, what: string): LiveStatus {
  const s = STATUSES[String(value)];
  if (!s) throw new Error(`Unknown status ${JSON.stringify(value)} for ${what}`);
  return s;
}

function parseBout(value: unknown): LiveBout {
  const b = object(value, "fight");
  const ufcFightId = id(b.FightId, "fight id");
  const boutStatus = status(b.Status, `fight ${ufcFightId}`);
  if (!Array.isArray(b.Fighters) || b.Fighters.length !== 2) throw new Error(`Fight ${ufcFightId} does not have two fighters`);

  const fighters = b.Fighters.map(f => {
    const fighter = object(f, `fighter in fight ${ufcFightId}`);
    const outcome = fighter.Outcome && typeof fighter.Outcome === "object" ? (fighter.Outcome as Json).Outcome : null;
    return { ufcFighterId: id(fighter.FighterId, `fighter id in fight ${ufcFightId}`), outcome: typeof outcome === "string" ? outcome : null };
  });

  const r = b.Result && typeof b.Result === "object" ? (b.Result as Json) : {};
  const methodText = typeof r.Method === "string" ? r.Method.trim() : "";
  const winners = fighters.filter(f => f.outcome === "Win");

  if (!methodText) {
    // A winner with no method is a feed mid-update, not a result.
    return winners.length
      ? { ufcFightId, status: boutStatus, result: null, issues: ["Winner present but method is missing"] }
      : { ufcFightId, status: boutStatus, result: null };
  }

  const raw: Json = {
    status: b.Status,
    method: r.Method,
    endingRound: r.EndingRound ?? null,
    endingTime: r.EndingTime ?? null,
    outcomes: fighters.map(f => ({ fighterId: f.ufcFighterId, outcome: f.outcome })),
  };
  const final = b.Status === "Final";
  const time = typeof r.EndingTime === "string" && /^[0-5]?[0-9]:[0-5][0-9]$/.test(r.EndingTime) ? r.EndingTime : null;
  const voided = (reason: VoidReason): LiveBout => ({
    ufcFightId,
    status: boutStatus,
    result: { final, winnerUfcFighterId: null, method: null, round: null, time, voidReason: reason, raw },
  });
  const held = (issue: string): LiveBout => ({ ufcFightId, status: boutStatus, result: null, issues: [issue] });

  // A draw is published as the decision that produced it ("Decision -
  // Unanimous"), so the outcomes, not the method, say it was a draw.
  if (fighters.every(f => f.outcome === "Draw")) return voided("DRAW");
  if (fighters.every(f => f.outcome === "No Contest")) return voided("NC");

  const normalized = normalizeMethod(methodText);
  if ("issue" in normalized) return held(normalized.issue);
  if ("voidReason" in normalized) return voided(normalized.voidReason);
  if (winners.length !== 1) return held("Result has no unique winner");

  const winnerUfcFighterId = winners[0].ufcFighterId;
  if (normalized.method === "DEC") {
    return { ufcFightId, status: boutStatus, result: { final, winnerUfcFighterId, method: "DEC", round: null, time, voidReason: null, raw } };
  }
  const round = r.EndingRound;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > 5) return held("Finish has no valid round");
  return { ufcFightId, status: boutStatus, result: { final, winnerUfcFighterId, method: normalized.method, round, time, voidReason: null, raw } };
}

/** Reads every bout's result from one event in the UFC stats feed. Missing
 * structure throws; a result that is present but unclear is held pending with
 * an issue, since a wrong method silently costs users points.
 */
export function parseResults(payload: unknown): LiveCard {
  const root = object(payload, "payload");
  const event = object(root.LiveEventDetail ?? root, "event");
  const ufcEventId = id(event.EventId, "event id");
  if (!Array.isArray(event.FightCard)) throw new Error(`Event ${ufcEventId} has no fight card`);
  const bouts = event.FightCard.map(parseBout);
  if (new Set(bouts.map(b => b.ufcFightId)).size !== bouts.length) throw new Error(`Duplicate fight ids in event ${ufcEventId}`);
  const live = event.LiveFightId;
  return {
    ufcEventId,
    status: status(event.Status, `event ${ufcEventId}`),
    liveFightId: typeof live === "number" && live > 0 ? String(live) : null,
    bouts,
  };
}
