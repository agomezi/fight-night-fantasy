// Method prose to scoring methods, shared by the event-page parser and the
// live results sync. Dependency-free so the Edge Function imports it directly.

export type ResultMethod = "KO" | "SUB" | "DEC";
export type VoidReason = "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED";

/** Method rulings. Set a value to null to hold that method for review instead.
 * Frozen so parsing does not depend on mutable runtime configuration.
 *
 * doctorsStoppage -> KO: a doctor's stoppage is officially recorded as a TKO,
 *   so it is a finish like any other.
 * technicalDecision -> DEC: still decided on the scorecards.
 * disqualification -> DEC: someone won and it was not a finish, so the winner
 *   earns method credit. Note the round is dropped — a DQ usually ends inside a
 *   round, but DEC carries no round by contract, and losing the round is a
 *   smaller cost than voiding a bout that had a real winner.
 */
export const METHOD_RULINGS: Readonly<{
  doctorsStoppage: "KO" | null;
  technicalDecision: "DEC" | null;
  disqualification: "DEC" | null;
}> = Object.freeze({ doctorsStoppage: "KO", technicalDecision: "DEC", disqualification: "DEC" });

export type Normalized = { method: ResultMethod } | { voidReason: VoidReason } | { issue: string };
export function normalizeMethod(raw: string): Normalized {
  const value = raw.trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (/^(no contest|nc|could not continue|overturned)$/i.test(value)) return { voidReason: "NC" };
  if (/^(?:draw(?:\s*[-(].*)?|(?:technical|unanimous|split|majority) draw)$/i.test(value)) return { voidReason: "DRAW" };
  if (/^cancelled$|^canceled$/i.test(value)) return { voidReason: "CANCELLED" };
  if (/^(?:(?:KO\/TKO|KO|TKO)\s*[-(]\s*)?doctor'?s? stoppage\)?$/i.test(value)) {
    return METHOD_RULINGS.doctorsStoppage ? { method: METHOD_RULINGS.doctorsStoppage } : { issue: "Doctor's stoppage needs a ruling" };
  }
  if (/^technical decision(?:\s*[-(].*)?$/i.test(value)) {
    return METHOD_RULINGS.technicalDecision ? { method: METHOD_RULINGS.technicalDecision } : { issue: "Technical decision needs a ruling" };
  }
  if (/^(?:disqualification|dq)(?:\s*[-(].*)?$/i.test(value)) {
    return METHOD_RULINGS.disqualification ? { method: METHOD_RULINGS.disqualification } : { issue: "Disqualification needs a ruling" };
  }
  if (/^(?:KO\/TKO|KO|TKO)(?:\s*\([^)]*\))?$/i.test(value)) return { method: "KO" };
  if (/^(?:submission|sub|technical submission)(?:\s*\([^)]*\))?$/i.test(value)) return { method: "SUB" };
  if (/^(?:decision(?:\s*-\s*(?:unanimous|split|majority))?|(?:unanimous|split|majority) decision)$/i.test(value)) return { method: "DEC" };
  return { issue: `Unrecognized method: ${raw}` };
}
