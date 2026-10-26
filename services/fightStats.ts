// One fight's stats for the stats sheet: what bout_stats() returns, and the
// rows the sheet draws from it. The shaping is pure so it can be tested
// without a database.

import type { BoutLine } from "./eventDetail";
import type { FighterStats, Pair } from "./ingestion/fightStats";

export type { FighterStats };

export type BoutStats = {
  official: boolean;
  updatedAt: string;
  /** This fight is in the cage right now. */
  live: boolean;
  round: number | null;
  clock: string | null;
  red: FighterStats;
  blue: FighterStats;
  rounds: { round: number; red: FighterStats; blue: FighterStats }[];
};

export type StatRow = {
  label: string;
  red: string;
  blue: string;
  /** Red's share of the two, 0–1, for the bar; 0.5 when both are zero. */
  redShare: number;
  /** "84%" under each side, for strikes and takedowns. */
  redNote?: string;
  blueNote?: string;
  /** Both sides at zero, drawn faded. */
  empty: boolean;
};

/** The big number at the top: significant strikes landed. */
export type Hero = { red: number; blue: number; redShare: number };

const share = (r: number, b: number) => (r + b === 0 ? 0.5 : r / (r + b));
const pct = ([landed, attempted]: Pair) => (attempted ? `${Math.round((landed / attempted) * 100)}%` : "—");
/** 247 → "4:07" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function landedRow(label: string, r: Pair, b: Pair, withAccuracy: boolean): StatRow {
  return {
    label,
    red: `${r[0]}/${r[1]}`,
    blue: `${b[0]}/${b[1]}`,
    redShare: share(r[0], b[0]),
    empty: r[0] + b[0] === 0,
    ...(withAccuracy ? { redNote: pct(r), blueNote: pct(b) } : {}),
  };
}
const countRow = (label: string, r: number, b: number, show: (n: number) => string = String): StatRow =>
  ({ label, red: show(r), blue: show(b), redShare: share(r, b), empty: r + b === 0 });

const sideFor = (stats: BoutStats, round: number | null) =>
  round == null ? stats : stats.rounds.find(r => r.round === round);

/** Sig. strikes landed, for the whole fight (round null) or one round. */
export function heroFor(stats: BoutStats, round: number | null): Hero | null {
  const pick = sideFor(stats, round);
  if (!pick) return null;
  return { red: pick.red.sig[0], blue: pick.blue.sig[0], redShare: share(pick.red.sig[0], pick.blue.sig[0]) };
}

/** The rows under the sig. strikes, for the whole fight (round null) or one round. */
export function statRows(stats: BoutStats, round: number | null): StatRow[] {
  const pick = sideFor(stats, round);
  if (!pick) return [];
  const { red: r, blue: b } = pick;
  const accuracy = ([landed, attempted]: Pair) => (attempted ? landed / attempted : 0);
  return [
    landedRow("Total strikes", r.total, b.total, true),
    countRow("Knockdowns", r.knockdowns, b.knockdowns),
    landedRow("Takedowns", r.takedowns, b.takedowns, false),
    countRow("Control", r.control, b.control, clock),
    countRow("Sub attempts", r.subAttempts, b.subAttempts),
    {
      label: "Sig. accuracy",
      red: pct(r.sig),
      blue: pct(b.sig),
      redShare: share(accuracy(r.sig), accuracy(b.sig)),
      empty: r.sig[1] + b.sig[1] === 0,
    },
  ];
}

/** Whether the event screen offers a bout's stats: always while it's in the
 * cage (they fill in as it goes), otherwise only when some are stored for a
 * fight that happened: a result, one waiting on its result, a draw or a no
 * contest. Never one cancelled or that lost a fighter. */
export function hasStats(line: Pick<BoutLine, "state" | "result">, stored: boolean): boolean {
  if (line.state === "live") return true;
  if (!stored) return false;
  if (line.state === "pending" || line.state === "provisional" || line.state === "final") return true;
  return line.state === "void" && (line.result === "Draw" || line.result === "No contest");
}

/** "LIVE · R2 3:14", "UNOFFICIAL", "OFFICIAL". */
export function statusLabel(stats: BoutStats): string {
  if (stats.live) return stats.round ? `LIVE · R${stats.round}${stats.clock ? ` ${stats.clock}` : ""}` : "LIVE";
  return stats.official ? "OFFICIAL" : "UNOFFICIAL";
}

/** The ids of an event's bouts that have stats stored. */
export async function loadStatsBouts(eventId: string): Promise<Set<string>> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("stats_bouts", { event: eventId });
  if (error) throw new Error(error.message);
  return new Set((data as string[] | null) ?? []);
}

export async function loadBoutStats(boutId: string): Promise<BoutStats | null> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("bout_stats", { bout: boutId });
  if (error) throw new Error(error.message);
  return (data as BoutStats | null) ?? null;
}
