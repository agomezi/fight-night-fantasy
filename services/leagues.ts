// Leagues: the caller's leagues, a league's standings and weekly matchups, and
// creating, joining and leaving. The shaping is pure so it can be tested
// without a database.

export type LeagueTier = "casual" | "amateur" | "pro" | "hardcore";

/** active — in this season's rotation; queued — joins at the next season;
 * left — leaving at the end of this season; former — a deleted account. */
export type MemberStatus = "active" | "queued" | "left" | "former";

export type MyLeague = {
  id: string;
  name: string;
  tier: LeagueTier;
  inviteCode: string;
  isOwner: boolean;
  members: number;
  status: MemberStatus;
  rank: number | null;
  record: string;
  points: number;
};

export type LeagueStanding = {
  /** Null for anyone not ranked this season. */
  rank: number | null;
  /** True when another player shares the rank. */
  tied: boolean;
  userId: string;
  name: string;
  status: MemberStatus;
  wins: number;
  losses: number;
  draws: number;
  record: string;
  points: number;
  /** 0–100, or null before anything has been scored. */
  accuracy: number | null;
  isMe: boolean;
  isOwner: boolean;
};

export type LeagueStandings = {
  season: string;
  /** False until the league is playing a ranked season. */
  ranked: boolean;
  rows: LeagueStanding[];
  me: LeagueStanding | null;
};

export type MatchupState = "upcoming" | "live" | "final";

export type MatchupSide = { userId: string; name: string; points: number | null };

export type Matchup = {
  week: number;
  eventId: string | null;
  eventName: string | null;
  state: MatchupState;
  /** With `isMine`, side `a` is always you. */
  a: MatchupSide;
  b: MatchupSide;
  winnerId: string | null;
  isMine: boolean;
};

export type Week = { week: number; eventName: string | null; state: MatchupState; matchups: Matchup[] };

export const MIN_MEMBERS = 4;
export const MAX_MEMBERS = 12;

export const TIER_LABEL: Record<LeagueTier, string> = {
  casual: "Casual",
  amateur: "Amateur",
  pro: "Pro",
  hardcore: "Hardcore",
};

/** What each tier changes, in a line. Hardcore is not open yet. */
export const TIER_BLURB: Record<Exclude<LeagueTier, "hardcore">, string> = {
  casual: "Half deductions, and your season total never drops below 0.",
  amateur: "Full deductions with a floor at 0 — but an all-wrong pick at 0 leaves you owing 20.",
  pro: "Full deductions, no floor. Every point counts both ways.",
};

export function recordOf(wins: number, losses: number, draws: number): string {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

/** "1", or "T-2" when the rank is shared. */
export function rankLabel(rank: number | null, tied = false): string {
  if (rank == null) return "—";
  return tied ? `T-${rank}` : String(rank);
}

type RawLeague = {
  league_id: string;
  name: string;
  tier: LeagueTier;
  invite_code: string;
  is_owner: boolean;
  members: number;
  my_status: MemberStatus;
  my_rank: number | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

export function toMyLeagues(raw: RawLeague[]): MyLeague[] {
  return raw.map((r) => ({
    id: r.league_id,
    name: r.name,
    tier: r.tier,
    inviteCode: r.invite_code.toUpperCase(),
    isOwner: r.is_owner,
    members: Number(r.members),
    status: r.my_status,
    rank: r.my_rank == null ? null : Number(r.my_rank),
    record: recordOf(Number(r.wins), Number(r.losses), Number(r.draws)),
    points: Number(r.points),
  }));
}

type RawStanding = {
  rank: number | null;
  user_id: string;
  display_name: string;
  status: MemberStatus;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  correct: number;
  counted: number;
  is_me: boolean;
  is_owner: boolean;
  season_label: string;
};

export function toStandings(raw: RawStanding[]): LeagueStandings {
  const ranks = new Map<number, number>();
  for (const r of raw) if (r.rank != null) ranks.set(Number(r.rank), (ranks.get(Number(r.rank)) ?? 0) + 1);

  const rows = raw.map((r) => {
    const rank = r.rank == null ? null : Number(r.rank);
    const wins = Number(r.wins);
    const losses = Number(r.losses);
    const draws = Number(r.draws);
    return {
      rank,
      tied: rank != null && (ranks.get(rank) ?? 0) > 1,
      userId: r.user_id,
      name: r.display_name,
      status: r.status,
      wins,
      losses,
      draws,
      record: recordOf(wins, losses, draws),
      points: Number(r.points),
      accuracy: Number(r.counted) > 0 ? Math.round((Number(r.correct) / Number(r.counted)) * 100) : null,
      isMe: r.is_me,
      isOwner: r.is_owner,
    };
  });

  return {
    season: raw[0]?.season_label ?? "PRE-SEASON",
    ranked: rows.some((r) => r.rank != null),
    rows,
    me: rows.find((r) => r.isMe) ?? null,
  };
}

type RawMatchup = {
  week: number;
  event_id: string | null;
  event_name: string | null;
  state: MatchupState;
  user_a: string;
  name_a: string;
  points_a: number | null;
  user_b: string | null;
  name_b: string | null;
  points_b: number | null;
  winner: string | null;
  is_mine: boolean;
};

const num = (n: number | null) => (n == null ? null : Number(n));

/**
 * Matchups grouped by week, yours first in each and oriented so you're side
 * `a`. In an odd league one player has a doubleheader, so you can have two.
 */
export function toWeeks(raw: RawMatchup[], myId: string | null): Week[] {
  const weeks = new Map<number, Week>();
  for (const r of raw) {
    if (r.user_b == null) continue;
    let a: MatchupSide = { userId: r.user_a, name: r.name_a, points: num(r.points_a) };
    let b: MatchupSide = { userId: r.user_b, name: r.name_b ?? "Player", points: num(r.points_b) };
    if (b.userId === myId) [a, b] = [b, a];

    const week = Number(r.week);
    if (!weeks.has(week)) {
      weeks.set(week, { week, eventName: r.event_name, state: r.state, matchups: [] });
    }
    weeks.get(week)!.matchups.push({
      week,
      eventId: r.event_id,
      eventName: r.event_name,
      state: r.state,
      a,
      b,
      winnerId: r.winner,
      isMine: r.is_mine,
    });
  }
  for (const w of weeks.values()) w.matchups.sort((x, y) => Number(y.isMine) - Number(x.isMine));
  return [...weeks.values()].sort((x, y) => x.week - y.week);
}

/** The week to show first: the live one, else the next upcoming, else the last. */
export function currentWeek(weeks: Week[]): Week | null {
  return (
    weeks.find((w) => w.state === "live") ??
    weeks.find((w) => w.state === "upcoming") ??
    weeks[weeks.length - 1] ??
    null
  );
}

/** How a finished or running matchup reads from your side. */
export function matchupOutcome(m: Matchup): "won" | "lost" | "drew" | "leading" | "trailing" | "level" | null {
  if (m.a.points == null || m.b.points == null) return null;
  if (m.state === "final") {
    if (m.winnerId == null) return "drew";
    return m.winnerId === m.a.userId ? "won" : "lost";
  }
  if (m.a.points === m.b.points) return "level";
  return m.a.points > m.b.points ? "leading" : "trailing";
}

/** What a league mate's profile shows. Nothing else about them is sent. */
export type MemberProfile = {
  name: string;
  accuracy: number | null;
  favoriteDivision: string | null;
  isMe: boolean;
  canReport: boolean;
  reported: boolean;
};

export type RawMemberProfile = {
  display_name: string;
  accuracy: number | null;
  favorite_division: string | null;
  is_me: boolean;
  can_report: boolean;
  reported: boolean;
};

/** Null when the profile isn't available: the player isn't in the league, or you aren't. */
export function toMemberProfile(raw: RawMemberProfile[]): MemberProfile | null {
  const r = raw[0];
  if (!r) return null;
  return {
    name: r.display_name,
    accuracy: r.accuracy,
    favoriteDivision: r.favorite_division,
    isMe: r.is_me,
    canReport: r.can_report,
    reported: r.reported,
  };
}

export type ReportReason = "offensive name" | "impersonation" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "offensive name", label: "Offensive name" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadMyLeagues(): Promise<MyLeague[]> {
  const { data, error } = await (await db()).rpc("my_leagues");
  if (error) throw new Error(error.message);
  return toMyLeagues((data ?? []) as RawLeague[]);
}

export async function loadStandings(leagueId: string): Promise<LeagueStandings> {
  const { data, error } = await (await db()).rpc("league_standings", { league: leagueId });
  if (error) throw new Error(error.message);
  return toStandings((data ?? []) as RawStanding[]);
}

export async function loadWeeks(leagueId: string, myId: string | null): Promise<Week[]> {
  const { data, error } = await (await db()).rpc("league_matchups", { league: leagueId });
  if (error) throw new Error(error.message);
  return toWeeks((data ?? []) as RawMatchup[], myId);
}

/** The database's messages are written for players, so they are shown as is. */
export async function createLeague(name: string, tier: Exclude<LeagueTier, "hardcore">): Promise<string> {
  const { data, error } = await (await db()).rpc("create_league", { name, tier });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function joinLeague(code: string): Promise<string> {
  const { data, error } = await (await db()).rpc("join_league", { code });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function leaveLeague(leagueId: string): Promise<void> {
  const { error } = await (await db()).rpc("leave_league", { league: leagueId });
  if (error) throw new Error(error.message);
}

export async function removeMember(leagueId: string, userId: string): Promise<void> {
  const { error } = await (await db()).rpc("remove_league_member", { league: leagueId, member: userId });
  if (error) throw new Error(error.message);
}

export async function loadMemberProfile(leagueId: string, userId: string): Promise<MemberProfile | null> {
  const { data, error } = await (await db()).rpc("league_member_profile", { league: leagueId, member: userId });
  if (error) throw new Error(error.message);
  return toMemberProfile((data ?? []) as RawMemberProfile[]);
}

/** Reports a league mate's name. False when that name was already reported by you. */
export async function reportMember(
  leagueId: string,
  userId: string,
  reason: ReportReason,
  note?: string
): Promise<boolean> {
  const { data, error } = await (await db()).rpc("report_league_member", {
    league: leagueId,
    member: userId,
    reason,
    note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export function inviteMessage(league: { name: string; inviteCode: string }): string {
  return `Join "${league.name}" on Fight Night Fantasy 🥊 Code: ${league.inviteCode}`;
}

export function isPreseason(standings: LeagueStandings | null): boolean {
  return standings?.season === "PRE-SEASON";
}

/** Why you have no rank in a league yet, in a line. Null once you have one. */
export function waitingLine(league: MyLeague, standings: LeagueStandings | null, weeks: Week[]): string | null {
  const preseason = isPreseason(standings);
  if (league.members < MIN_MEMBERS) {
    const more = MIN_MEMBERS - league.members;
    return preseason
      ? `Invite ${more} more — head-to-heads start once there are ${MIN_MEMBERS}.`
      : `Invite ${more} more — a league needs ${MIN_MEMBERS} when the next season starts.`;
  }
  if (league.status === "queued") return "You join the rotation when the next season starts.";
  if (standings?.me?.rank != null) return null;
  if (weeks.length > 0) return "The table starts after the first card.";
  return null;
}
