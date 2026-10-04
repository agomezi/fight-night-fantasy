// Saving and loading a user's picks. The row mapping is pure so it can be
// tested without a database; the server enforces the lock and validity.

import type { LanePick } from "../components/RoundLane";
import { lastName, type EventBout } from "./events";

export type PickRow = {
  bout_id: string;
  bout_version: number;
  picked_fighter_id: string;
  finish: "round" | "DEC" | "ANY";
  finish_round: number | null;
  method: "KO" | "SUB" | null;
};

export function toPickRow(bout: EventBout, pick: LanePick): PickRow {
  const round = typeof pick.finish === "number";
  return {
    bout_id: bout.id,
    bout_version: bout.version,
    picked_fighter_id: pick.corner === "red" ? bout.red.id : bout.blue.id,
    finish: round ? "round" : (pick.finish as "DEC" | "ANY"),
    finish_round: round ? (pick.finish as number) : null,
    // A decision pick carries no method.
    method: pick.finish === "DEC" ? null : (pick.method ?? null),
  };
}

/** The saved pick as the lane shows it, or null when it no longer applies:
 * the bout has changed fighters since, so the pick has to be made again.
 */
export function fromPickRow(bout: EventBout, row: PickRow): LanePick | null {
  if (row.bout_version !== bout.version) return null;
  const corner = row.picked_fighter_id === bout.red.id ? "red" : row.picked_fighter_id === bout.blue.id ? "blue" : null;
  if (!corner) return null;
  const finish = row.finish === "round" && row.finish_round ? row.finish_round : row.finish === "round" ? "ANY" : row.finish;
  return { corner, finish, ...(row.method ? { method: row.method } : {}) };
}

/** A saved pick as one short line: "SILVA · KO/TKO · R2", "SILVA · DEC", "SILVA". */
export function pickSummary(bout: EventBout, pick: LanePick): string {
  const fighter = pick.corner === "red" ? bout.red : bout.blue;
  const parts = [lastName(fighter.name).toUpperCase()];
  if (pick.finish === "DEC") parts.push("DEC");
  else {
    if (pick.method) parts.push(pick.method === "KO" ? "KO/TKO" : "SUB");
    if (typeof pick.finish === "number") parts.push(`R${pick.finish}`);
  }
  return parts.join(" · ");
}

export async function loadPicks(bouts: EventBout[]): Promise<Record<string, LanePick>> {
  if (!bouts.length) return {};
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("picks")
    .select("bout_id, bout_version, picked_fighter_id, finish, finish_round, method")
    .in("bout_id", bouts.map((b) => b.id));
  if (error) throw new Error(error.message);
  const byId = new Map(bouts.map((b) => [b.id, b]));
  const picks: Record<string, LanePick> = {};
  for (const row of (data ?? []) as PickRow[]) {
    const bout = byId.get(row.bout_id);
    const pick = bout && fromPickRow(bout, row);
    if (pick) picks[row.bout_id] = pick;
  }
  return picks;
}

export class PicksLockedError extends Error {}

function check(error: { hint?: string; message: string } | null) {
  if (error?.hint === "locked") throw new PicksLockedError("Picks are locked for this card.");
  if (error) throw new Error(error.message);
}

/** Saves the card as it stands: every pick made is upserted, and any bout
 * left unpicked has its saved pick removed, since a card can be partial. The
 * server rejects both once the event has locked, whatever this device's
 * clock says.
 */
export async function savePicks(userId: string, bouts: EventBout[], picks: Record<string, LanePick>): Promise<void> {
  const rows = bouts.filter((b) => picks[b.id]).map((b) => ({ user_id: userId, ...toPickRow(b, picks[b.id]) }));
  const cleared = bouts.filter((b) => !picks[b.id]).map((b) => b.id);
  const { supabase } = await import("./supabase");
  if (rows.length) {
    const { error } = await supabase.from("picks").upsert(rows, { onConflict: "user_id,bout_id" });
    check(error);
  }
  if (cleared.length) {
    const { error } = await supabase.from("picks").delete().eq("user_id", userId).in("bout_id", cleared);
    check(error);
  }
}
