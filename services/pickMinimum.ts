// Warning players short of a league's minimum picks, on Home from the day
// before the card. Pure, apart from remembering a dismissal on the phone.
// Missing a league's minimum loses that week's matchup, and the server
// (met_league_picks) decides that; this only says so in time.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LeagueTier, PickRule } from "./leagues";
import { requiredBouts, type TierBout } from "./tierPicks";

export type MinimumBout = TierBout & {
  locksAt: Date;
  /** Fighters changed after it locked: void, required by nobody. */
  changedAfterLock?: boolean;
};

export type LeagueShortfall = {
  league: string;
  /** Fights the league requires on this card. */
  required: number;
  picked: number;
  /** Required fights that locked unpicked: the week is already a forfeit. */
  missed: number;
  /** Required fights still open and unpicked. */
  left: number;
  /** The earliest of those to lock. */
  next: MinimumBout | null;
};

/**
 * The fights a league requires, as league_required_bouts counts them: the
 * top N by position at the lock, void fights included in the count, then
 * left out; the main event is the first fight still standing.
 */
export function requiredOnCard<T extends MinimumBout>(
  tier: LeagueTier,
  card: T[],
  rule?: PickRule | null
): T[] {
  const standing = card.filter((b) => !b.changedAfterLock);
  const required = new Set(requiredBouts(tier, card, rule).filter((b) => !b.changedAfterLock));
  if (standing[0]) required.add(standing[0]);
  return standing.filter((b) => required.has(b));
}

/** For each league with a minimum on this card, how far along you are. The
 * whole card, ordered main event first, void fights included. */
export function leagueShortfalls<T extends MinimumBout>(
  leagues: { name: string; tier: LeagueTier; rule?: PickRule | null }[],
  card: T[],
  picked: (id: string) => boolean,
  now: Date
): LeagueShortfall[] {
  const out: LeagueShortfall[] = [];
  for (const l of leagues) {
    const required = requiredOnCard(l.tier, card, l.rule);
    if (!required.length) continue;
    const unpicked = required.filter((b) => !picked(b.id));
    const open = unpicked.filter((b) => b.locksAt.getTime() > now.getTime());
    const next = open.reduce<T | null>((a, b) => (!a || b.locksAt < a.locksAt ? b : a), null);
    out.push({
      league: l.name,
      required: required.length,
      picked: required.length - unpicked.length,
      missed: unpicked.length - open.length,
      left: open.length,
      next,
    });
  }
  return out;
}

export type MinimumBanner =
  | { kind: "missed"; league: string }
  | {
      kind: "short";
      league: string;
      required: number;
      picked: number;
      next: MinimumBout;
      /** The earliest required lock across every short league, so ✕ never
       * hides the banner past one. */
      soonest: Date;
    };

/** How long before the card's first lock the banner starts showing. */
export const BANNER_LEAD_MS = 24 * 60 * 60 * 1000;
/** A dismissed banner comes back this long before the next required lock,
 * with that section's reminder. */
const COME_BACK_MS = 60 * 60 * 1000;

/**
 * The Home banner, if any. A missed minimum always shows and can't be
 * dismissed. Otherwise, from a day before the card's first lock, the league
 * still needing the most open fights, until every minimum is met, unless
 * dismissed until a time still to come.
 */
export function minimumBanner(
  shortfalls: LeagueShortfall[],
  firstLock: Date,
  now: Date,
  dismissedUntil: number | null
): MinimumBanner | null {
  const missed = shortfalls.find((s) => s.missed > 0);
  if (missed) return { kind: "missed", league: missed.league };
  if (now.getTime() < firstLock.getTime() - BANNER_LEAD_MS) return null;
  const short = shortfalls.filter((s) => s.left > 0 && s.next);
  const worst = [...short].sort((a, b) => b.left - a.left || a.league.localeCompare(b.league))[0];
  if (!worst?.next) return null;
  if (dismissedUntil != null && now.getTime() < dismissedUntil) return null;
  const soonest = new Date(Math.min(...short.map((s) => s.next!.locksAt.getTime())));
  return { kind: "short", league: worst.league, required: worst.required, picked: worst.picked, next: worst.next, soonest };
}

/** Until when ✕ hides the banner: an hour before that lock, or the lock
 * itself when that's already inside the hour. */
export function dismissUntil(locksAt: Date, now: Date): number {
  const back = locksAt.getTime() - COME_BACK_MS;
  return back > now.getTime() ? back : locksAt.getTime();
}

const SECTION = { main: "Main card", prelims: "Prelims", early_prelims: "Early prelims" } as const;

/** "3h 12m", "3h", "45m", "2d 4h". */
export function lockIn(locksAt: Date, now: Date): string {
  const total = Math.max(1, Math.ceil((locksAt.getTime() - now.getTime()) / 60000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** What the banner says. */
export function bannerText(b: MinimumBanner, now: Date): { title: string; body: string } {
  if (b.kind === "missed") {
    return {
      title: `Missed ${b.league}'s minimum · this week is a forfeit`,
      body: "A fight it needed locked before you picked it. The rest still count for global.",
    };
  }
  const section = b.next.segment ? SECTION[b.next.segment] : SECTION.main;
  const verb = section === SECTION.main ? "locks" : "lock";
  return {
    title: `${b.league} needs ${b.required} pick${b.required === 1 ? "" : "s"} · you've made ${b.picked}`,
    body: `${section} ${verb} in ${lockIn(b.next.locksAt, now)}. Miss one and you forfeit this week's matchup.`,
  };
}

const DISMISS_KEY = "pick-minimum-dismissed";

/** When the banner for this card was dismissed until, if it was. */
export async function loadDismissed(eventId: string): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(`${DISMISS_KEY}:${eventId}`);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export async function saveDismissed(eventId: string, until: number): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISS_KEY}:${eventId}`, String(until));
  } catch {}
}
