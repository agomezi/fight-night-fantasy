// Award drops: superlatives handed out at a review of the season so far. Each
// league crowns its own; global crowns the P4P #1. Half-season drops are
// announced; a season's final drop locks its awards in as profile badges. The owner runs and
// publishes a drop from the SQL editor (see the award_drops migration). The
// shaping is pure so it can be tested without a database.

import type { Ionicons } from "@expo/vector-icons";

export type AwardId =
  | "interim_champ"
  | "champ"
  | "top_seed"
  | "p4p"
  | "finisher"
  | "judge"
  | "chalk"
  | "dog"
  | "sniper"
  | "ice_cold"
  | "sharpshooter"
  | "method_man"
  | "iron_man"
  | "call_of_night"
  | "oracle"
  | "iron_chin"
  | "pro_can"
  | "gun_shy";

type AwardInfo = {
  title: string;
  /** What it's for, in a line. */
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** The stat behind it, from the stored value. */
  stat: (value: number) => string;
  /** A joke: shown last, in a lighter tone. */
  joke?: boolean;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.round(-v)}` : "0");
const count = (one: string, many: string) => (v: number) => `${Math.round(v)} ${Math.round(v) === 1 ? one : many}`;

export const AWARDS: Record<AwardId, AwardInfo> = {
  interim_champ: { title: "Interim Champ", blurb: "#1 in the league at the review", icon: "trophy", stat: () => "" },
  champ: { title: "Champ", blurb: "Holds the league's belt at season's end", icon: "trophy", stat: () => "" },
  top_seed: { title: "Top Seed", blurb: "#1 in the league table at season's end", icon: "medal", stat: () => "" },
  p4p: { title: "P4P #1", blurb: "The best edge on the global board", icon: "podium", stat: (v) => `${signed(v)} edge` },
  finisher: { title: "The Finisher", blurb: "Almost never calls a decision", icon: "flash", stat: (v) => `${pct(v)} finish calls` },
  judge: { title: "Decision Merchant", blurb: "Sees it going the distance", icon: "document-text", stat: (v) => `${pct(v)} decision calls` },
  chalk: { title: "Fence Sitter", blurb: "Backs the favourite", icon: "shield", stat: (v) => `${pct(v)} favourites` },
  dog: { title: "Upset Artist", blurb: "Lives on underdogs", icon: "trending-up", stat: count("underdog win", "underdog wins") },
  sniper: { title: "Round Sniper", blurb: "Calls the round", icon: "locate", stat: (v) => `${pct(v)} of rounds right` },
  ice_cold: { title: "Prophet", blurb: "A whole card without a miss", icon: "eye", stat: count("perfect card", "perfect cards") },
  sharpshooter: { title: "Cornerman", blurb: "Gets the most picks right", icon: "ribbon", stat: (v) => `${pct(v)} right` },
  method_man: { title: "Method Man", blurb: "Calls how it ends", icon: "hammer", stat: count("method right", "methods right") },
  iron_man: { title: "Journeyman", blurb: "Picks the most fights", icon: "walk", stat: count("pick", "picks") },
  call_of_night: { title: "Call of the Night", blurb: "The best single call (underdog bonus included)", icon: "star", stat: (v) => `${signed(v)} pts` },
  oracle: { title: "The Oracle", blurb: "Calls the hot takes", icon: "sparkles", stat: (v) => `${pct(v)} of takes right` },
  iron_chin: {
    title: "Iron Chin",
    blurb: "The longest unbeaten run of matchups",
    icon: "shield-checkmark",
    stat: count("matchup unbeaten", "matchups unbeaten"),
  },
  pro_can: {
    title: "Professional Can",
    blurb: "Last in the league on card after card",
    icon: "trash-bin",
    stat: count("card in last", "cards in last"),
    joke: true,
  },
  gun_shy: { title: "Ring Rust", blurb: "Picks the fewest fights by far", icon: "hourglass", stat: (v) => `${Math.round(v * 10) / 10} picks a card`, joke: true },
};

/** The order they're shown in: the title first, the joke last. */
export const AWARD_ORDER: AwardId[] = [
  "interim_champ",
  "champ",
  "top_seed",
  "p4p",
  "iron_chin",
  "sharpshooter",
  "oracle",
  "finisher",
  "judge",
  "dog",
  "chalk",
  "sniper",
  "method_man",
  "call_of_night",
  "ice_cold",
  "iron_man",
  "pro_can",
  "gun_shy",
];

export type DropInfo = {
  id: string;
  label: string;
  kind: "checkin" | "midseason" | "final";
  ranAt?: string;
  publishedAt?: string;
  /** When the first card after it locks; null when none is scheduled yet. */
  nextLockAt?: string | null;
};

export type AwardWin = { award: AwardId; userId: string; name: string; value: number | null };

export type Projection = { wins: number; losses: number; draws: number; points: number };

export type DropRow = {
  userId: string;
  name: string;
  rank: number | null;
  record: string;
  points: number;
  projected: Projection | null;
};

export type LeagueDrop = {
  drop: DropInfo;
  /** Ordered for showing; ties list every winner. */
  awards: AwardWin[];
  p4p: { userId: string; name: string; edge: number } | null;
  table: DropRow[];
  /** Your place in each category, 1 = first. */
  myPlaces: Partial<Record<AwardId, number>>;
};

type RawLeagueDrop = {
  drop: DropInfo;
  awards: { award: AwardId; userId: string; name: string; value: number | null }[];
  p4p: { userId: string; name: string; edge: number } | null;
  table: {
    userId: string;
    name: string;
    rank: number | null;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    points: number | null;
    projected: Projection | null;
  }[];
  me: { places?: Partial<Record<AwardId, number>> } | null;
};

function record(w: number, l: number, d: number) {
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

export function toLeagueDrop(raw: RawLeagueDrop | null): LeagueDrop | null {
  if (!raw) return null;
  const known = raw.awards.filter((a) => a.award in AWARDS);
  const order = (a: AwardWin) => AWARD_ORDER.indexOf(a.award);
  return {
    drop: raw.drop,
    awards: known
      .map((a) => ({ ...a, value: a.value == null ? null : Number(a.value) }))
      .sort((x, y) => order(x) - order(y) || x.name.localeCompare(y.name)),
    p4p: raw.p4p ? { ...raw.p4p, edge: Number(raw.p4p.edge) } : null,
    table: raw.table.map((r) => ({
      userId: r.userId,
      name: r.name,
      rank: r.rank == null ? null : Number(r.rank),
      record: record(Number(r.wins ?? 0), Number(r.losses ?? 0), Number(r.draws ?? 0)),
      points: Number(r.points ?? 0),
      projected: r.projected
        ? {
            wins: Number(r.projected.wins),
            losses: Number(r.projected.losses),
            draws: Number(r.projected.draws),
            points: Number(r.projected.points),
          }
        : null,
    })),
    myPlaces: raw.me?.places ?? {},
  };
}

/** "PRE-SEASON CHECK-IN" over the reveal. */
export function dropHeading(drop: DropInfo): string {
  return drop.label.toUpperCase();
}

/** The champion's title for this drop: Interim Champ at a review, Champ at the end. */
export function champTitle(drop: DropInfo): string {
  return drop.kind === "final" ? "Champ" : "Interim Champ";
}

/** What to say about you: what you won, or your best placing. */
export function yourLine(d: LeagueDrop, myId: string | null): string | null {
  if (!myId) return null;
  const won = d.awards.filter((a) => a.userId === myId && !AWARDS[a.award].joke);
  if (won.length) return `You won ${won.map((a) => AWARDS[a.award].title).join(", ")}.`;
  const best = (Object.entries(d.myPlaces) as [AwardId, number][])
    .filter(([id]) => id in AWARDS && !AWARDS[id].joke)
    .sort((x, y) => x[1] - y[1])[0];
  if (!best) return "Pick a few more fights to get into the running.";
  return `Your best: ${ordinal(best[1])} in ${AWARDS[best[0]].title}.`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** The text the Share button sends. */
export function shareText(leagueName: string, d: LeagueDrop): string {
  const lines = d.awards.map((a) => {
    const info = AWARDS[a.award];
    const stat = a.value == null ? "" : info.stat(a.value);
    return `${info.title}: ${a.name}${stat ? ` (${stat})` : ""}`;
  });
  return [`${leagueName} · ${d.drop.label} awards 🏆`, "", ...lines, "", "Fight Night Fantasy"].join("\n");
}

/** How long a drop's card stays on the league page after it's published. */
export const DROP_SHOWN_DAYS = 7;

/** When the drop's card leaves the league page: a week after it's published,
 * or when the next card locks if that's later, so a midweek drop is still up
 * for the weekend. Null without a publish time, which keeps it up. */
export function dropShownUntil(drop: DropInfo): Date | null {
  if (!drop.publishedAt) return null;
  const week = new Date(drop.publishedAt).getTime() + DROP_SHOWN_DAYS * 24 * 60 * 60 * 1000;
  const lock = drop.nextLockAt ? new Date(drop.nextLockAt).getTime() : null;
  return new Date(lock != null && lock > week ? lock : week);
}

export function showsOnLeaguePage(drop: DropInfo, now: Date): boolean {
  const until = dropShownUntil(drop);
  return until == null || now.getTime() < until.getTime();
}

/** The drops for the list under the standings: all but the one the league
 * page shows (the latest drop, while it's still up there). */
export function pastDrops(drops: DropInfo[], latest: DropInfo | null, now: Date): DropInfo[] {
  return latest && showsOnLeaguePage(latest, now) ? drops.filter((d) => d.id !== latest.id) : drops;
}

type RawDrop = {
  id: string;
  label: string;
  kind: DropInfo["kind"];
  ran_at: string;
  published_at?: string | null;
  next_lock_at?: string | null;
};

export function toDropInfo(r: RawDrop): DropInfo {
  return {
    id: r.id,
    label: r.label,
    kind: r.kind,
    ranAt: r.ran_at,
    publishedAt: r.published_at ?? undefined,
    nextLockAt: r.next_lock_at ?? null,
  };
}

/** "Oct 25": the day a drop was published (or run, before that was known), in ET. */
export function dropDate(drop: DropInfo): string {
  const at = drop.publishedAt ?? drop.ranAt;
  if (!at) return "";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/** An award won at a season's final drop, kept on the profile for good. */
export type Badge = { award: AwardId; title: string; icon: AwardInfo["icon"]; joke: boolean; scope: string; season: string };

type RawBadge = { award: string; season: number; scope: string; value: number | null };

/** Newest season first, then in award order; unknown awards are left out. */
export function toBadges(raw: RawBadge[]): Badge[] {
  return raw
    .filter((b): b is RawBadge & { award: AwardId } => b.award in AWARDS)
    .map((b) => ({
      award: b.award,
      title: AWARDS[b.award].title,
      icon: AWARDS[b.award].icon,
      joke: !!AWARDS[b.award].joke,
      scope: b.scope,
      season: `S${b.season}`,
    }))
    .sort(
      (x, y) =>
        Number(y.season.slice(1)) - Number(x.season.slice(1)) || AWARD_ORDER.indexOf(x.award) - AWARD_ORDER.indexOf(y.award)
    );
}

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadLatestDrop(): Promise<DropInfo | null> {
  const { data, error } = await (await db()).rpc("latest_award_drop_v2");
  if (error) return null; // Before the server has awards, there are none.
  const row = (data ?? [])[0] as RawDrop | undefined;
  return row ? toDropInfo(row) : null;
}

/** This season's drops with something for the league, newest published first. */
export async function loadLeagueDrops(leagueId: string): Promise<DropInfo[]> {
  const { data, error } = await (await db()).rpc("league_award_drops", { league: leagueId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawDrop[]).map(toDropInfo);
}

export async function loadLeagueDrop(leagueId: string, dropId?: string): Promise<LeagueDrop | null> {
  const { data, error } = await (await db()).rpc("league_award_drop", { league: leagueId, drop: dropId ?? null });
  if (error) throw new Error(error.message);
  return toLeagueDrop((data ?? null) as RawLeagueDrop | null);
}

export async function loadBadges(userId: string): Promise<Badge[]> {
  const { data, error } = await (await db()).rpc("player_badges", { member: userId });
  if (error) return []; // Before the server has badges, there are none.
  return toBadges((data ?? []) as RawBadge[]);
}
