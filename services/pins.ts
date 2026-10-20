// Pinned calls: up to 3 of a player's best calls, shown on their profile and
// on the card others open from a league or the leaderboard. Only a correct
// call on a final result can be pinned. The shaping is pure so it can be
// tested without a database.

import { lastName } from "./events";
import { pickLabel } from "./history";

export const MAX_PINNED_CALLS = 3;

export type PinnedCall = {
  boutId: string;
  /** "UFC Fight Night: Pereira vs. Ankalaev" */
  event: string;
  /** "Oct 17" */
  date: string;
  /** "PEREIRA vs ANKALAEV" */
  fight: string;
  /** What was called: "PEREIRA · KO · R2". */
  call: string;
  /** "+125" */
  points: string;
};

export type RawPinnedCall = {
  bout_id: string;
  event_name: string;
  event_date: string;
  red_name: string;
  blue_name: string;
  picked_name: string;
  finish: "round" | "DEC" | "ANY";
  finish_round: number | null;
  method: "KO" | "SUB" | null;
  points: number;
};

export class PinLimitError extends Error {}

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

export function toPinnedCalls(raw: RawPinnedCall[]): PinnedCall[] {
  return raw.map((r) => ({
    boutId: r.bout_id,
    event: r.event_name,
    date: new Date(r.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }),
    fight: `${lastName(r.red_name).toUpperCase()} vs ${lastName(r.blue_name).toUpperCase()}`,
    call: pickLabel(r, r.picked_name),
    points: signed(Number(r.points)),
  }));
}

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadPinnedCalls(userId: string): Promise<PinnedCall[]> {
  const { data, error } = await (await db()).rpc("pinned_calls", { member: userId });
  if (error) throw new Error(error.message);
  return toPinnedCalls((data ?? []) as RawPinnedCall[]);
}

export async function pinCall(boutId: string): Promise<void> {
  const { error } = await (await db()).rpc("pin_call", { bout: boutId });
  if (error?.hint === "pin_limit") throw new PinLimitError(error.message);
  if (error) throw new Error(error.message);
}

export async function unpinCall(boutId: string): Promise<void> {
  const { error } = await (await db()).rpc("unpin_call", { bout: boutId });
  if (error) throw new Error(error.message);
}
