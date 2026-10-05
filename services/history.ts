// A user's played events: every locked card they picked, each bout's result,
// what they called and what it scored. The shaping is pure so it can be tested
// without a database; loadHistory only fetches.

import { initials, lastName } from "./events";

type Fighter = { id: string; name: string };
type ResultRow = {
  status: "provisional" | "final";
  winner_fighter_id: string | null;
  method: "KO" | "SUB" | "DEC" | null;
  round: number | null;
  time: string | null;
  void_reason: "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED" | null;
};

export type HistoryPickRow = {
  bout_id: string;
  bout_version: number;
  picked_fighter_id: string;
  finish: "round" | "DEC" | "ANY";
  finish_round: number | null;
  method: "KO" | "SUB" | null;
  bout: {
    id: string;
    fight_order: number;
    version: number;
    status: "scheduled" | "cancelled";
    red: Fighter;
    blue: Fighter;
    event: { id: string; name: string; starts_at: string; locks_at: string; status: string; season_id: string | null };
    // One-to-one, which PostgREST may return as an object or a one-item list.
    result: ResultRow | ResultRow[] | null;
  };
};

export type HistoryScoreRow = {
  bout_id: string;
  points: number;
  correct: boolean;
  counts_for_accuracy: boolean;
  provisional: boolean;
};

export type Season = { id: string; number: number };

export type HistorySide = { initials: string; name: string; method?: string };

export type HistoryBout = {
  id: string;
  red: HistorySide;
  blue: HistorySide;
  /** False until there is a result to show. */
  settled: boolean;
  /** "Final", "Provisional", "Pending", "No contest", "Draw", "Cancelled". */
  meta: string;
  /** "R2, 3:41". */
  detail?: string;
  /** "+125", "-95", "0"; absent until scored. */
  points?: string;
  verdict: "hit" | "miss" | "void" | "pending";
  /** What you called: "PEREIRA · KO · R2". */
  pick: string;
  /** Why a void pick scored nothing. */
  voidNote?: string;
};

export type HistoryEvent = {
  id: string;
  name: string;
  /** "9 Mar". */
  date: string;
  live: boolean;
  /** Some of this total can still change. */
  provisional: boolean;
  points: number;
  /** Bouts called correctly, out of how many counted. */
  hit: number;
  total: number;
  /** Bouts picked, scored or not. */
  picked: number;
  bouts: HistoryBout[];
};

export type History = {
  season: { label: string; points: number; hit: number; total: number; events: number };
  /** Newest first. */
  events: HistoryEvent[];
};

const METHOD_LABEL = { KO: "KO/TKO", SUB: "SUB", DEC: "DEC" } as const;
const VOID_META = { NC: "No contest", DRAW: "Draw", CANCELLED: "Cancelled", FIGHTER_CHANGED: "Void" } as const;
const VOID_NOTE = {
  NC: "VOID · NO CONTEST",
  DRAW: "VOID · DRAW",
  CANCELLED: "VOID · BOUT CANCELLED",
  FIGHTER_CHANGED: "VOID · OPPONENT CHANGED",
} as const;

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", day: "numeric", month: "short" }).format(new Date(iso));
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

function side(fighter: Fighter, method?: string): HistorySide {
  return { initials: initials(fighter.name), name: fighter.name, ...(method ? { method } : {}) };
}

/** "PEREIRA · KO · R2", "PEREIRA · DEC", "PEREIRA". */
export function pickLabel(row: Pick<HistoryPickRow, "finish" | "finish_round" | "method">, fighterName: string): string {
  const parts = [lastName(fighterName).toUpperCase()];
  if (row.finish === "DEC") parts.push("DEC");
  else {
    if (row.method) parts.push(METHOD_LABEL[row.method]);
    if (row.finish === "round" && row.finish_round) parts.push(`R${row.finish_round}`);
  }
  return parts.join(" · ");
}

function boutFor(row: HistoryPickRow, score: HistoryScoreRow | undefined): HistoryBout {
  const { bout } = row;
  const result = Array.isArray(bout.result) ? (bout.result[0] ?? null) : bout.result;
  const picked = row.picked_fighter_id === bout.red.id ? bout.red : bout.blue;
  const pick = pickLabel(row, picked.name);
  const base = { id: bout.id, pick, ...(score ? { points: signed(score.points) } : {}) };

  if (bout.status === "cancelled" && !result) {
    return { ...base, red: side(bout.red), blue: side(bout.blue), settled: false, meta: "Cancelled", verdict: "void", voidNote: VOID_NOTE.CANCELLED };
  }
  if (!result) {
    return { ...base, red: side(bout.red), blue: side(bout.blue), settled: false, meta: "Pending", verdict: "pending" };
  }
  if (result.void_reason) {
    const label = result.void_reason === "DRAW" ? "DRAW" : result.void_reason === "NC" ? "NC" : undefined;
    return {
      ...base,
      red: side(bout.red, label),
      blue: side(bout.blue, label),
      settled: !!label,
      meta: VOID_META[result.void_reason],
      verdict: "void",
      voidNote: VOID_NOTE[result.void_reason],
    };
  }

  const method = result.method ? METHOD_LABEL[result.method] : undefined;
  const detail = result.round ? (result.time ? `R${result.round}, ${result.time}` : `R${result.round}`) : undefined;
  const scored = {
    ...base,
    red: side(bout.red, result.winner_fighter_id === bout.red.id ? method : undefined),
    blue: side(bout.blue, result.winner_fighter_id === bout.blue.id ? method : undefined),
    settled: true,
    meta: result.status === "final" ? "Final" : "Provisional",
    ...(detail ? { detail } : {}),
  };
  // Made before the opponent was replaced: scored as a void.
  if (row.bout_version !== bout.version || (score && !score.counts_for_accuracy)) {
    return { ...scored, verdict: "void", voidNote: VOID_NOTE.FIGHTER_CHANGED };
  }
  if (!score) return { ...scored, verdict: "pending" };
  return { ...scored, verdict: score.correct ? "hit" : "miss" };
}

/**
 * Shapes picks and scores into played events. Only cards that have locked
 * appear: before that, picks can still change and nothing has been played.
 * The season card totals the current season, or every unslotted event before
 * the first season opens.
 */
export function buildHistory(picks: HistoryPickRow[], scores: HistoryScoreRow[], season: Season | null, now: Date): History {
  const scoreByBout = new Map(scores.map(s => [s.bout_id, s]));
  const byEvent = new Map<string, { event: HistoryPickRow["bout"]["event"]; rows: HistoryPickRow[] }>();
  for (const row of picks) {
    const ev = row.bout.event;
    if (new Date(ev.locks_at).getTime() > now.getTime()) continue;
    const entry = byEvent.get(ev.id) ?? { event: ev, rows: [] };
    entry.rows.push(row);
    byEvent.set(ev.id, entry);
  }

  const events: (HistoryEvent & { startsAt: string; seasonId: string | null })[] = [];
  for (const { event, rows } of byEvent.values()) {
    rows.sort((a, b) => a.bout.fight_order - b.bout.fight_order);
    let points = 0;
    let hit = 0;
    let total = 0;
    let provisional = false;
    const bouts = rows.map(row => {
      const score = scoreByBout.get(row.bout_id);
      if (score) {
        points += score.points;
        if (score.counts_for_accuracy) {
          total += 1;
          if (score.correct) hit += 1;
        }
        if (score.provisional) provisional = true;
      }
      return boutFor(row, score);
    });
    const live = event.status === "live";
    if (live && bouts.some(b => b.verdict === "pending")) provisional = true;
    events.push({
      id: event.id,
      name: event.name,
      date: dateLabel(event.starts_at),
      live,
      provisional,
      points,
      hit,
      total,
      picked: rows.length,
      bouts,
      startsAt: event.starts_at,
      seasonId: event.season_id,
    });
  }
  events.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const inSeason = events.filter(e => e.seasonId === (season?.id ?? null));
  return {
    season: {
      label: season ? `SEASON ${season.number}` : "PRE-SEASON",
      points: inSeason.reduce((sum, e) => sum + e.points, 0),
      hit: inSeason.reduce((sum, e) => sum + e.hit, 0),
      total: inSeason.reduce((sum, e) => sum + e.total, 0),
      events: inSeason.length,
    },
    events: events.map(({ startsAt, seasonId, ...e }) => e),
  };
}

export const HISTORY_PICKS_QUERY = `
  bout_id, bout_version, picked_fighter_id, finish, finish_round, method,
  bout:bouts!inner (
    id, fight_order, version, status,
    red:fighters!bouts_red_fighter_id_fkey ( id, name ),
    blue:fighters!bouts_blue_fighter_id_fkey ( id, name ),
    event:events!bouts_event_id_fkey!inner ( id, name, starts_at, locks_at, status, season_id ),
    result:results ( status, winner_fighter_id, method, round, time, void_reason )
  )`;

export async function loadHistory(userId: string, now: Date = new Date()): Promise<History> {
  // Imported here so the pure shaping above loads without the native client.
  const { supabase } = await import("./supabase");
  const [picks, scores, season] = await Promise.all([
    supabase.from("picks").select(HISTORY_PICKS_QUERY).eq("user_id", userId),
    supabase.from("scores").select("bout_id, points, correct, counts_for_accuracy, provisional").eq("user_id", userId),
    supabase.from("seasons").select("id, number").order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [picks, scores, season]) if (r.error) throw new Error(r.error.message);
  return buildHistory(
    (picks.data ?? []) as unknown as HistoryPickRow[],
    (scores.data ?? []) as HistoryScoreRow[],
    (season.data as Season | null) ?? null,
    now
  );
}
