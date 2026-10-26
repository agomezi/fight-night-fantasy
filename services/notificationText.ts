// What each push notification says. Pure and dependency-free, so the results
// sync imports it under Deno and jest tests it here.

export type NotificationKind =
  | "reminder"
  | "scored"
  | "final"
  | "league_join"
  | "moderation"
  | "matchup"
  | "standing"
  | "awards"
  | "odds"
  | "schedule"
  | "rank"
  | "poll"
  | "name_restored"
  | "name_kept";

/** `section` is "main" for the reminder before the main card locks, which
 * also counts the main card fights you haven't picked, and "changed" when
 * the main event you picked changed fighters before locking. "eve" is the
 * day before, for a player short of a league's minimum, and "segment" an
 * hour before a later section with a required fight still to pick; both
 * name the league asking for the most. */
export type ReminderPayload = {
  event: string;
  minutes?: number;
  hasMainPick?: boolean;
  section?: "main" | "changed" | "eve" | "segment";
  missing?: number;
  /** Open fights any of your leagues requires that you haven't picked. */
  leagueMissing?: number;
  red?: string;
  blue?: string;
  league?: string;
  /** "eve": the fights the league requires, and how many you've picked. */
  required?: number;
  picked?: number;
  /** "eve": when the card's first fights lock. `tz` is the player's zone,
   * added when the push is sent; the inbox uses the phone's. */
  firstAt?: string;
  tz?: string;
  /** "segment": the section locking, and its required fights still to pick. */
  segment?: "main" | "prelims" | "early_prelims";
  segmentMissing?: number;
};
export type ScoredPayload = {
  event: string;
  /** The bout, so tapping opens history at it. Missing on older sends. */
  bout?: string;
  points: number;
  /** What the underdog multiplier added; 0 or missing when it didn't apply. */
  dogBonus?: number;
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
/** The lead in your head-to-head changed hands: `lead` when you took it. */
export type MatchupPayload = {
  event: string;
  league: string;
  leagueId: string;
  opponent: string;
  /** Missing on rows from before it was added; the inbox reads it off the key. */
  opponentId?: string;
  mine: number;
  theirs: number;
  lead: boolean;
};
/** Where you stand in each league you're ranked in, as the main card starts. */
export type StandingPayload = {
  event: string;
  leagues: { league: string; leagueId: string; rank: number; tied: boolean }[];
};
/**
 * A moderator's decision, or `under_review` when enough reports hide the
 * player's name until a moderator looks. `until` is when a suspension ends.
 * `alias` is the number others see while the name is hidden ("Player #4821"),
 * missing on older sends.
 */
export type ModerationPayload = {
  action: "warn" | "reset_name" | "suspend" | "lift" | "under_review";
  reason?: string;
  until?: string;
  alias?: number;
};
/** A moderator found nothing wrong with a hidden name, so it's back. */
export type NameRestoredPayload = { name: string };
/** A warning or reset for a player who had already renamed: the old name is
 * retired and the new one stays. */
export type NameKeptPayload = { action: "warn" | "reset_name"; reason?: string };

/** A fight you picked flipped underdog before it locked. */
export type OddsPayload = {
  event: string;
  eventId?: string;
  boutId?: string;
  picked: string;
  /** Whether your pick is now the underdog. */
  pickedIsDog: boolean;
  dog: string;
  favorite: string;
};
/** A card starting at an unusual time, or one that moved. `tz` is the
 * player's zone, added when the push is sent; the inbox uses the phone's. */
export type SchedulePayload = {
  event: string;
  eventId?: string;
  firstAt: string;
  mainAt: string;
  when: "early" | "late" | "day" | "moved";
  hasPrelims: boolean;
  tz?: string;
};
/** Your career rank went up. */
export type RankPayload = { rank: string; event?: string };
/** A new community question is up on Home. */
export type PollPayload = { question: string; pollId?: string; eventId?: string; closesAt?: string };

/** Where players write to appeal a decision. */
export const SUPPORT_EMAIL = "fightnightfantasymma@gmail.com";

/** `screen` is where tapping it goes; `leagueId` picks the league there and
 * `bout` the fight in history. */
export type Message = {
  title: string;
  body: string;
  /** `opponent` picks the matchup on the head-to-head screen in a doubleheader week. */
  data: { screen: string; leagueId?: string; bout?: string; opponent?: string };
};

const METHOD = { KO: "KO/TKO", SUB: "Submission", DEC: "Decision" } as const;
const SECTION = { main: "Main card", prelims: "Prelims", early_prelims: "Early prelims" } as const;
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

/** "Alexander Volkanovski" -> "Volkanovski", "Tony Ferguson Jr." -> "Ferguson". */
function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? name;
}

/** A time or weekday in `tz`, or the phone's zone without one. A zone this
 * engine doesn't know reads as Eastern rather than failing the push. */
function inZone(iso: string, tz: string | undefined, options: Intl.DateTimeFormatOptions): string {
  const at = new Date(iso);
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/New_York" }).format(at);
  }
}

function clock(iso: string, tz?: string): string {
  return inZone(iso, tz, { hour: "numeric", minute: "2-digit" });
}

function odds(p: OddsPayload): Message {
  const who = surname(p.picked);
  return p.pickedIsDog
    ? {
        title: `Odds flipped: ${who} is now the underdog`,
        body: "If it's still that way when the fight locks, your pick is worth 1.5x.",
        data: { screen: "picks" },
      }
    : {
        title: `Odds flipped: ${who} is now the favorite`,
        body: "No underdog bonus on this pick unless it flips back before the lock.",
        data: { screen: "picks" },
      };
}

function schedule(p: SchedulePayload): Message {
  const card = title(p.event);
  const main = clock(p.mainAt, p.tz);
  if (p.when === "moved") {
    return { title: `${card} moved`, body: `The main card now starts at ${main}. Picks lock as each part starts.`, data: { screen: "picks" } };
  }
  // The day in the player's zone; one that's still Saturday there reads as an
  // odd time instead.
  const day = inZone(p.mainAt, p.tz, { weekday: "long" });
  const head =
    p.when === "day"
      ? day === "Saturday"
        ? `${card} starts at an unusual time`
        : `${card} is on a ${day}`
      : `${card} starts ${p.when === "early" ? "earlier" : "later"} than usual`;
  const times = p.hasPrelims ? `Prelims at ${clock(p.firstAt, p.tz)}, main card at ${main}.` : `Main card at ${main}.`;
  return { title: head, body: `${times} Get your picks in before then.`, data: { screen: "picks" } };
}

function rank(p: RankPayload): Message {
  return { title: `You're now a ${p.rank}`, body: "Your career rank went up. Keep stacking cards.", data: { screen: "profile" } };
}

function poll(p: PollPayload): Message {
  return { title: `New question: ${p.question}`, body: "Vote on Home, then see how everyone else split.", data: { screen: "home" } };
}

function reminder(p: ReminderPayload): Message {
  if (p.section === "changed") {
    return {
      title: `${title(p.event)} main event changed`,
      body: `It's now ${p.red} vs ${p.blue}. Your pick no longer counts, so pick it again before it locks.`,
      data: { screen: "picks" },
    };
  }
  if (p.section === "eve") {
    const when = p.firstAt
      ? `${inZone(p.firstAt, p.tz, { weekday: "long" })} at ${clock(p.firstAt, p.tz)}`
      : "tomorrow";
    const made = p.picked ? `You've made ${p.picked}.` : "You haven't made any yet.";
    const need = p.required ?? p.leagueMissing ?? 1;
    return {
      title: `${p.league ?? "Your league"} needs ${need} pick${need === 1 ? "" : "s"} for ${title(p.event)}`,
      body: `${made} The first fights lock ${when}. Miss one and you forfeit this week's matchup.`,
      data: { screen: "picks" },
    };
  }
  if (p.section === "segment") {
    const label = SECTION[p.segment ?? "main"];
    return {
      title: `${label} lock${p.segment === "main" ? "s" : ""} in ${p.minutes} min`,
      body: `${p.league ?? "Your league"} still needs ${p.segmentMissing ?? 1} of them from you. Miss one and you forfeit this week's matchup.`,
      data: { screen: "picks" },
    };
  }
  const owed = p.leagueMissing ?? 0;
  const owedLine = `Your leagues still need ${owed} more pick${owed === 1 ? "" : "s"} from you. Miss one and you lose that matchup.`;
  if (p.section === "main") {
    const missing = Math.max(p.missing ?? 0, owed);
    return {
      title: `Main card starts in ${p.minutes} min`,
      body: missing > 0
        ? `You have ${missing} main card fight${missing === 1 ? "" : "s"} left to pick. Lock in your picks before it starts.`
        : "Your main card picks are in. Last chance to change them before it locks.",
      data: { screen: "picks" },
    };
  }
  return {
    title: `${title(p.event)} locks in ${p.minutes} min`,
    body: !p.hasMainPick
      ? "You haven't picked the main event yet. Get your card in before it locks."
      : owed > 0
        ? owedLine
        : "Your picks are in. Each part of the card locks as it starts, so change them while you can.",
    data: { screen: "picks" },
  };
}

function atBout(bout: string | undefined): Message["data"] {
  return bout ? { screen: "history", bout } : { screen: "history" };
}

function scored(p: ScoredPayload): Message {
  const prefix = p.correction ? "Correction: " : "";
  if (p.void || !p.winner) {
    return {
      title: `${prefix}${p.red} vs ${p.blue}`,
      body: `${VOID[p.void ?? ""] ?? "Void"}. No points either way.`,
      data: atBout(p.bout),
    };
  }
  const how = p.method ? METHOD[p.method] : "";
  const when = p.round ? ` · R${p.round}${p.time ? ` ${p.time}` : ""}` : "";
  const verdict = p.correct ? "✓" : "✗";
  return {
    title: `${prefix}${p.winner} def. ${p.loser}`,
    // Provisional results can still be corrected by the official feed.
    body: `${how}${when} — ${verdict} ${signed(p.points)} pts${p.dogBonus ? ` (+${p.dogBonus} DOG)` : ""}${p.provisional ? " · may still change" : ""}`,
    data: atBout(p.bout),
  };
}

function final(p: FinalPayload): Message {
  return {
    title: `${title(p.event)} is final`,
    body: `You scored ${signed(p.points)} pts and called ${p.hit} of ${p.total}.`,
    data: { screen: "history" },
  };
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function matchup(p: MatchupPayload): Message {
  const by = Math.abs(p.mine - p.theirs);
  const score = `(${p.mine}–${p.theirs})`;
  const data = { screen: "matchup", leagueId: p.leagueId, ...(p.opponentId ? { opponent: p.opponentId } : {}) };
  return p.lead
    ? {
        title: `You passed ${p.opponent}`,
        body: `You're up ${by} in ${p.league} ${score}.`,
        data,
      }
    : {
        title: `${p.opponent} overtook you`,
        body: `You're down ${by} in ${p.league} ${score}.`,
        data,
      };
}

function standing(p: StandingPayload): Message {
  const places = p.leagues.map((l) => `${l.tied ? "tied " : ""}${ordinal(l.rank)} in ${l.league}`);
  const list = places.length <= 2 ? places.join(" and ") : `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
  const first = p.leagues[0];
  return {
    title: `${title(p.event)} main card is starting`,
    body: `You're ${list} going in.`,
    data: first ? { screen: "league-standings", leagueId: first.leagueId } : { screen: "leagues" },
  };
}

/** An award drop was published. */
export type AwardsPayload = { label: string; kind: "checkin" | "midseason" | "final"; dropId: string };

function awards(p: AwardsPayload): Message {
  return {
    title: `${p.label}: the awards are in`,
    body:
      p.kind === "final"
        ? "Your league's season awards are in. See who's champ and who won what."
        : "Your league's awards are in. See who won what, and where the season's heading.",
    data: { screen: "leagues" },
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
  if (p.action === "under_review") {
    if (p.alias) {
      return {
        title: "Your display name is under review",
        body: `Several players reported it, so others see you as "Player #${p.alias}" until a moderator checks it. Pick a new name and everyone sees it straight away.`,
        data: { screen: "edit-profile" },
      };
    }
    return {
      title: "Your display name is under review",
      body: 'Several players reported it, so others see you as "Player" until a moderator checks it. You can keep playing as normal.',
      data: { screen: "moderation" },
    };
  }
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

function nameKept(p: NameKeptPayload): Message {
  const why = p.reason ? ` Reason: ${p.reason.replace(/\.+$/, "")}.` : "";
  return {
    title: "Your new name stays",
    body: `Your old name broke our rules, so your new name stays.${why} Think this is a mistake? Email ${SUPPORT_EMAIL}.`,
    data: { screen: "moderation" },
  };
}

function nameRestored(p: NameRestoredPayload): Message {
  return {
    title: "Your name is back",
    body: `"${p.name}" is your name again. A moderator found nothing wrong with it. You can still change it in Edit Profile.`,
    data: { screen: "edit-profile" },
  };
}

export function notificationText(kind: NotificationKind, payload: unknown): Message {
  if (kind === "reminder") return reminder(payload as ReminderPayload);
  if (kind === "scored") return scored(payload as ScoredPayload);
  if (kind === "league_join") return leagueJoin(payload as LeagueJoinPayload);
  if (kind === "moderation") return moderation(payload as ModerationPayload);
  if (kind === "matchup") return matchup(payload as MatchupPayload);
  if (kind === "standing") return standing(payload as StandingPayload);
  if (kind === "awards") return awards(payload as AwardsPayload);
  if (kind === "odds") return odds(payload as OddsPayload);
  if (kind === "schedule") return schedule(payload as SchedulePayload);
  if (kind === "rank") return rank(payload as RankPayload);
  if (kind === "poll") return poll(payload as PollPayload);
  if (kind === "final") return final(payload as FinalPayload);
  if (kind === "name_restored") return nameRestored(payload as NameRestoredPayload);
  if (kind === "name_kept") return nameKept(payload as NameKeptPayload);
  // A kind from a newer server than this build.
  return { title: "Fight Night Fantasy", body: "You have a new notification.", data: { screen: "history" } };
}
