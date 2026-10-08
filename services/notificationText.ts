// What each push notification says. Pure and dependency-free, so the results
// sync imports it under Deno and jest tests it here.

export type NotificationKind = "reminder" | "scored" | "final" | "league_join" | "moderation" | "moderation_case";

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
export type LeagueJoinPayload = { league: string; leagueId: string; member: string };
/** A moderator's decision. `until` is when a suspension ends. */
export type ModerationPayload = { action: "warn" | "reset_name" | "suspend" | "lift"; reason?: string; until?: string };

/** For moderators: a case opened, or reached three reporters. */
export type ModerationCasePayload = { caseId: number; stage: "opened" | "three"; name: string; reason: string | null; reporters: number };

/** Where players write to appeal a decision. */
export const SUPPORT_EMAIL = "fightnightfantasymma@gmail.com";

/** `screen` is where tapping it goes; `leagueId` or `caseId` picks what to show there. */
export type Message = { title: string; body: string; data: { screen: string; leagueId?: string; caseId?: number } };

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

function leagueJoin(p: LeagueJoinPayload): Message {
  return {
    title: `${p.member} joined ${p.league}`,
    body: "Tap to see where they fit in your league.",
    data: { screen: "league-standings", leagueId: p.leagueId },
  };
}

function moderation(p: ModerationPayload): Message {
  const why = p.reason ? ` Reason: ${p.reason.replace(/\.+$/, "")}.` : "";
  const appeal = ` Think this is a mistake? Email ${SUPPORT_EMAIL}.`;
  if (p.action === "warn") {
    return {
      title: "Please change your display name",
      body: `Your name was reported and breaks our rules.${why} Change it in Edit Profile.${appeal}`,
      data: { screen: "edit-profile" },
    };
  }
  if (p.action === "reset_name") {
    return {
      title: "Your display name was reset",
      body: `It broke our rules.${why} You'll pick a new one the next time you open the app.${appeal}`,
      data: { screen: "moderation" },
    };
  }
  if (p.action === "suspend") {
    const until = p.until
      ? new Date(p.until).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : "further notice";
    return {
      title: "Your account is suspended",
      body: `Until ${until}, you can look around but can't make picks, join leagues or report players.${why}${appeal}`,
      data: { screen: "moderation" },
    };
  }
  return {
    title: "Your account is back in good standing",
    body: "You can make picks and join leagues again.",
    data: { screen: "picks" },
  };
}

function moderationCase(p: ModerationCasePayload): Message {
  return {
    title: p.stage === "three" ? `${p.name} now has 3 reporters` : `New report: ${p.name}`,
    body: p.stage === "three" ? "Tap to review the case." : `${p.reason ?? "No reason given"}. Tap to review.`,
    data: { screen: "moderation-case", caseId: p.caseId },
  };
}

export function notificationText(kind: NotificationKind, payload: unknown): Message {
  if (kind === "reminder") return reminder(payload as ReminderPayload);
  if (kind === "scored") return scored(payload as ScoredPayload);
  if (kind === "league_join") return leagueJoin(payload as LeagueJoinPayload);
  if (kind === "moderation") return moderation(payload as ModerationPayload);
  if (kind === "moderation_case") return moderationCase(payload as ModerationCasePayload);
  return final(payload as FinalPayload);
}
