// One card in full: every bout in order, the fight in the cage, results with
// round and time, and the signed-in player's picks and points. The shaping is
// pure so it can be tested without a database; loadEventDetail only fetches.

import { initials, splitEventName } from "./events";
import { pickLabel } from "./history";

type Segment = "main" | "prelims" | "early_prelims";
type Fighter = { id: string; name: string; photoUrl: string | null };
type ResultRow = {
  status: "provisional" | "final";
  winner_fighter_id: string | null;
  method: "KO" | "SUB" | "DEC" | null;
  round: number | null;
  time: string | null;
  void_reason: "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED" | null;
};

export type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  locks_at: string;
  status: "scheduled" | "live" | "complete" | "cancelled";
  live_bout_id: string | null;
  bouts: {
    id: string;
    fight_order: number;
    card_segment: Segment | null;
    scheduled_rounds: number;
    weight_class: string | null;
    version: number;
    status: "scheduled" | "cancelled";
    locks_at: string | null;
    red: Fighter;
    blue: Fighter;
    // One-to-one, which PostgREST may return as an object or a one-item list.
    result: ResultRow | ResultRow[] | null;
  }[];
};

export type MyPick = {
  bout_id: string;
  bout_version: number;
  picked_fighter_id: string;
  finish: "round" | "DEC" | "ANY";
  finish_round: number | null;
  method: "KO" | "SUB" | null;
};
export type MyScore = { bout_id: string; points: number; correct: boolean; counts_for_accuracy: boolean; provisional: boolean };

export type Corner = { name: string; initials: string; photoUrl: string | null; won: boolean };

export type BoutLine = {
  id: string;
  order: number;
  weightClass: string | null;
  red: Corner;
  blue: Corner;
  state: "upcoming" | "live" | "pending" | "provisional" | "final" | "void" | "cancelled";
  /** "KO/TKO · R2 3:41", "Decision", "No contest". */
  result: string | null;
  /** What you called, or null if you passed on it. */
  pick: string | null;
  verdict: "hit" | "miss" | "void" | "pending" | null;
  /** "+125", "−95", "0"; null until scored. */
  points: string | null;
};

export type Section = { segment: Segment | null; label: string; locksAt: Date; locked: boolean; bouts: BoutLine[] };

export type EventDetail = {
  id: string;
  title: string;
  headline: string | null;
  startsAt: Date;
  status: "upcoming" | "live" | "final" | "cancelled";
  /** Some of the total can still change. */
  provisional: boolean;
  points: number;
  hit: number;
  total: number;
  picked: number;
  sections: Section[];
};

const SEGMENT_LABEL: Record<Segment, string> = { main: "MAIN CARD", prelims: "PRELIMS", early_prelims: "EARLY PRELIMS" };
const METHOD = { KO: "KO/TKO", SUB: "Submission", DEC: "Decision" } as const;
const VOID = { NC: "No contest", DRAW: "Draw", CANCELLED: "Cancelled", FIGHTER_CHANGED: "Void" } as const;

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

export function buildEventDetail(row: EventRow, picks: MyPick[], scores: MyScore[], now: Date): EventDetail {
  const pickByBout = new Map(picks.map((p) => [p.bout_id, p]));
  const scoreByBout = new Map(scores.map((s) => [s.bout_id, s]));
  let points = 0;
  let hit = 0;
  let total = 0;
  let provisional = false;

  const lines = [...row.bouts]
    .sort((a, b) => a.fight_order - b.fight_order)
    .map((bout) => {
      const result = Array.isArray(bout.result) ? (bout.result[0] ?? null) : bout.result;
      const pick = pickByBout.get(bout.id);
      const score = scoreByBout.get(bout.id);
      const locksAt = new Date(bout.locks_at ?? row.locks_at);
      const winner = result?.winner_fighter_id ?? null;

      let state: BoutLine["state"];
      let text: string | null = null;
      if (result?.void_reason) {
        state = "void";
        text = VOID[result.void_reason];
      } else if (result && result.method) {
        state = result.status === "final" ? "final" : "provisional";
        text = METHOD[result.method] + (result.round ? ` · R${result.round}${result.time ? ` ${result.time}` : ""}` : "");
      } else if (bout.status === "cancelled") {
        state = "cancelled";
        text = "Cancelled";
      } else if (row.live_bout_id === bout.id) {
        state = "live";
      } else {
        state = locksAt.getTime() <= now.getTime() && row.status !== "scheduled" ? "pending" : "upcoming";
      }

      if (score) {
        points += score.points;
        if (score.counts_for_accuracy) {
          total += 1;
          if (score.correct) hit += 1;
        }
        if (score.provisional) provisional = true;
      }

      const pickedFighter = pick ? (pick.picked_fighter_id === bout.red.id ? bout.red : bout.blue) : null;
      const verdict: BoutLine["verdict"] = !pick
        ? null
        : score
          ? !score.counts_for_accuracy
            ? "void"
            : score.correct
              ? "hit"
              : "miss"
          : state === "void" || state === "cancelled"
            ? "void"
            : "pending";

      const corner = (f: Fighter): Corner => ({ name: f.name, initials: initials(f.name), photoUrl: f.photoUrl, won: winner === f.id });
      const line: BoutLine = {
        id: bout.id,
        order: bout.fight_order,
        weightClass: bout.weight_class,
        red: corner(bout.red),
        blue: corner(bout.blue),
        state,
        result: text,
        pick: pick && pickedFighter ? pickLabel(pick, pickedFighter.name) : null,
        verdict,
        points: score ? signed(score.points) : null,
      };
      return { line, segment: bout.card_segment, locksAt };
    });

  // Sections in card order: the main card first, as the card is billed.
  const sections: Section[] = [];
  for (const { line, segment, locksAt } of lines) {
    const last = sections[sections.length - 1];
    if (last && last.segment === segment) {
      last.bouts.push(line);
      if (locksAt < last.locksAt) last.locksAt = locksAt;
    } else {
      sections.push({ segment, label: segment ? SEGMENT_LABEL[segment] : "FIGHT CARD", locksAt, locked: false, bouts: [line] });
    }
  }
  for (const s of sections) s.locked = s.locksAt.getTime() <= now.getTime();

  const { title, headline } = splitEventName(row.name);
  if (row.status === "live" && lines.some((l) => l.line.verdict === "pending")) provisional = true;
  return {
    id: row.id,
    title,
    headline,
    startsAt: new Date(row.starts_at),
    status: row.status === "scheduled" ? "upcoming" : row.status === "complete" ? "final" : row.status,
    provisional,
    points,
    hit,
    total,
    picked: picks.length,
    sections,
  };
}

export const EVENT_DETAIL_QUERY = `
  id, name, starts_at, locks_at, status, live_bout_id,
  bouts!bouts_event_id_fkey (
    id, fight_order, card_segment, scheduled_rounds, weight_class, version, status, locks_at,
    red:fighters!bouts_red_fighter_id_fkey ( id, name, photoUrl:photo_url ),
    blue:fighters!bouts_blue_fighter_id_fkey ( id, name, photoUrl:photo_url ),
    result:results ( status, winner_fighter_id, method, round, time, void_reason )
  )`;

export async function loadEventDetail(eventId: string, userId: string, now: Date = new Date()): Promise<EventDetail | null> {
  // Imported here so the pure shaping above loads without the native client.
  const { supabase } = await import("./supabase");
  const { data: event, error } = await supabase.from("events").select(EVENT_DETAIL_QUERY).eq("id", eventId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) return null;
  const boutIds = (event as unknown as EventRow).bouts.map((b) => b.id);
  const [picks, scores] = await Promise.all([
    supabase
      .from("picks")
      .select("bout_id, bout_version, picked_fighter_id, finish, finish_round, method")
      .eq("user_id", userId)
      .in("bout_id", boutIds),
    supabase
      .from("scores")
      .select("bout_id, points, correct, counts_for_accuracy, provisional")
      .eq("user_id", userId)
      .in("bout_id", boutIds),
  ]);
  for (const r of [picks, scores]) if (r.error) throw new Error(r.error.message);
  return buildEventDetail(event as unknown as EventRow, (picks.data ?? []) as MyPick[], (scores.data ?? []) as MyScore[], now);
}
