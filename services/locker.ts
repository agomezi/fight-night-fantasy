// The locker: your belt (career rank) and rare, public badges, each of which
// you can hide from your profile. The shaping is pure so it can be tested
// without a database.

import type { Ionicons } from "@expo/vector-icons";
import { RANKS, rankFor, type CareerRank } from "./career";

export type BadgeId = "og" | "legend" | "season_veteran" | "commissioner";
export type LockerItem = "belt" | BadgeId;

/** In the order they're shown. Must match locker_items() in the database. */
export const LOCKER_ITEMS: LockerItem[] = ["belt", "og", "legend", "season_veteran", "commissioner"];

type BadgeInfo = { title: string; icon: keyof typeof Ionicons.glyphMap; blurb: (seasons: number[]) => string };

const seasonList = (seasons: number[]) => seasons.map((n) => `Season ${n}`).join(", ");

export const BADGES: Record<BadgeId, BadgeInfo> = {
  og: { title: "OG", icon: "flame", blurb: () => "Played the pre-season, before Season 1." },
  legend: { title: "Legend", icon: "diamond", blurb: () => "Reached the top career rank." },
  season_veteran: { title: "Season Veteran", icon: "calendar", blurb: (s) => `Played every card of ${seasonList(s)}.` },
  commissioner: { title: "Commissioner", icon: "briefcase", blurb: (s) => `Ran a league through ${seasonList(s)}.` },
};

export type EarnedBadge = { id: BadgeId; title: string; icon: BadgeInfo["icon"]; blurb: string };

export type Belt = { rank: CareerRank; stripes: number };

const BELT_COLOURS: Record<CareerRank, string> = {
  Prospect: "White",
  Contender: "Blue",
  Ranked: "Purple",
  "Title Challenger": "Brown",
  Champion: "Black",
  Legend: "Red",
};

/** "Blue belt" and "Contender · 2 stripes", for the locker. */
export function beltLabel(belt: Belt): { title: string; sub: string } {
  const stripes = belt.stripes ? ` · ${belt.stripes} stripe${belt.stripes === 1 ? "" : "s"}` : "";
  return { title: `${BELT_COLOURS[belt.rank]} belt`, sub: `${belt.rank}${stripes}` };
}

export type Locker = {
  /** Null when hidden from you (another player's hidden belt). */
  belt: Belt | null;
  badges: EarnedBadge[];
  /** What you've hidden; only ever filled in for your own. */
  hidden: LockerItem[];
};

/** Your belt for a number of career points: the rank's colour, and up to four
 * stripes for how far through it you are. Legend has no stripes. */
export function beltFor(points: number): Belt {
  const rank = rankFor(points);
  const i = RANKS.findIndex((r) => r.rank === rank);
  const next = RANKS[i + 1];
  if (!next) return { rank, stripes: 0 };
  const progress = (points - RANKS[i].at) / (next.at - RANKS[i].at);
  return { rank, stripes: Math.min(4, Math.max(0, Math.floor(progress * 5))) };
}

type RawLocker = {
  points: number | null;
  badges: { id: string; seasons?: number[] }[];
  hidden: string[];
};

export function toLocker(raw: RawLocker | null): Locker | null {
  if (!raw) return null;
  return {
    belt: raw.points == null ? null : beltFor(Number(raw.points)),
    badges: (raw.badges ?? [])
      .filter((b): b is { id: BadgeId; seasons?: number[] } => b.id in BADGES)
      .map((b) => ({ id: b.id, title: BADGES[b.id].title, icon: BADGES[b.id].icon, blurb: BADGES[b.id].blurb(b.seasons ?? []) })),
    hidden: (raw.hidden ?? []).filter((h): h is LockerItem => (LOCKER_ITEMS as string[]).includes(h)),
  };
}

/** What shows on your own card: everything you haven't hidden. */
export function shown(locker: Locker | null): Locker | null {
  if (!locker) return null;
  return {
    belt: locker.hidden.includes("belt") ? null : locker.belt,
    badges: locker.badges.filter((b) => !locker.hidden.includes(b.id)),
    hidden: locker.hidden,
  };
}

async function db() {
  return (await import("./supabase")).supabase;
}

/** A player's locker; null for one you can't see, or before the server has lockers. */
export async function loadLocker(userId: string): Promise<Locker | null> {
  const { data, error } = await (await db()).rpc("player_locker_v2", { member: userId });
  if (error) return null;
  return toLocker((data ?? null) as RawLocker | null);
}

export async function setLockerItem(item: LockerItem, show: boolean): Promise<void> {
  const { error } = await (await db()).rpc("set_locker_item", { item, shown: show });
  if (error) throw new Error(error.message);
}
