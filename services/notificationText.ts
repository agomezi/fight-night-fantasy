// What each push notification says. Pure and dependency-free, so the results
// sync imports it under Deno and jest tests it here.

export type NotificationKind = "reminder" | "scored" | "final";

export type ReminderPayload = { event: string; minutes: number; hasMainPick: boolean };
export type ScoredPayload = {
  event: string;
  points: number;
  correct: boolean;
  counts: boolean;
  provisional: boolean;
  winner: string | null;
  loser: string | null;
  red: string;
  blue: string;
  method: "KO" | "SUB" | "DEC" | null;
  round: number | null;
  time: string | null;
  void: string | null;
  correction: boolean;
};
export type FinalPayload = { event: string; points: number; hit: number; total: number };

export type Message = { title: string; body: string; data: { screen: string } };

const METHOD = { KO: "KO/TKO", SUB: "Submission", DEC: "Decision" } as const;
const VOID = {
  NC: "No contest",
  DRAW: "Draw",
  CANCELLED: "Bout cancelled",
  FIGHTER_CHANGED: "Opponent changed",
} as Record<string, string>;

/** "UFC 332: Silva vs. Wang" -> "UFC 332". */
function title(event: string): string {
  const at = event.indexOf(":");
  return (at < 0 ? event : event.slice(0, at)).trim();
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

function reminder(p: ReminderPayload): Message {
  return {
    title: `${title(p.event)} locks in ${p.minutes} min`,
    body: p.hasMainPick
      ? "Your picks are in. Each part of the card locks as it starts, so change them while you can."
      : "You haven't picked the main event yet. Get your card in before it locks.",
    data: { screen: "picks" },
  };
}

function scored(p: ScoredPayload): Message {
  const prefix = p.correction ? "Correction: " : "";
  if (p.void || !p.winner) {
    return {
      title: `${prefix}${p.red} vs ${p.blue}`,
      body: `${VOID[p.void ?? ""] ?? "Void"}. No points either way.`,
      data: { screen: "history" },
    };
  }
  const how = p.method ? METHOD[p.method] : "";
  const when = p.round ? ` · R${p.round}${p.time ? ` ${p.time}` : ""}` : "";
  const verdict = p.correct ? "✓" : "✗";
  return {
    title: `${prefix}${p.winner} def. ${p.loser}`,
    body: `${how}${when} — ${verdict} ${signed(p.points)} pts${p.provisional ? " (provisional)" : ""}`,
    data: { screen: "history" },
  };
}

function final(p: FinalPayload): Message {
  return {
    title: `${title(p.event)} is final`,
    body: `You scored ${signed(p.points)} pts and called ${p.hit} of ${p.total}.`,
    data: { screen: "history" },
  };
}

export function notificationText(kind: NotificationKind, payload: unknown): Message {
  if (kind === "reminder") return reminder(payload as ReminderPayload);
  if (kind === "scored") return scored(payload as ScoredPayload);
  return final(payload as FinalPayload);
}
