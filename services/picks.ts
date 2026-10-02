// Saving and loading a user's picks. The row mapping is pure so it can be
// tested without a database; the server enforces the lock and validity.

import type { LanePick } from "../components/RoundLane";
import type { EventBout } from "./events";

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

/** Saves the whole card in one request. The server rejects it once the event
 * has locked, whatever this device's clock says.
 */
export async function savePicks(userId: string, bouts: EventBout[], picks: Record<string, LanePick>): Promise<void> {
  const rows = bouts.filter((b) => picks[b.id]).map((b) => ({ user_id: userId, ...toPickRow(b, picks[b.id]) }));
  if (!rows.length) return;
  const { supabase } = await import("./supabase");
  const { error } = await supabase.from("picks").upsert(rows, { onConflict: "user_id,bout_id" });
  if (error?.hint === "locked") throw new PicksLockedError("Picks are locked for this card.");
  if (error) throw new Error(error.message);
}
