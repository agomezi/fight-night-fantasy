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

export type DropInfo = { id: string; label: string; kind: "checkin" | "midseason" | "final"; ranAt?: string };

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
  const { data, error } = await (await db()).rpc("latest_award_drop");
  if (error) return null; // Before the server has awards, there are none.
  const row = (data ?? [])[0] as { id: string; label: string; kind: DropInfo["kind"]; ran_at: string } | undefined;
  return row ? { id: row.id, label: row.label, kind: row.kind, ranAt: row.ran_at } : null;
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
