// Titles: a player wears one award they've won (a season badge) next to their
// pro record. The shaping is pure so it can be tested without a database.

import { AWARD_ORDER, AWARDS, type AwardId, type Badge } from "./awards";
import type { Career } from "./career";

export type TitleOption = {
  award: AwardId;
  title: string;
  icon: Badge["icon"];
  joke: boolean;
  /** Where and when it was last won: "Crew · S2", with "· 2×" if won again. */
  where: string;
};

/** One option per award won, most recently won first, jokes last. */
export function titleOptions(badges: Badge[]): TitleOption[] {
  const byAward = new Map<AwardId, { latest: Badge; season: number; times: number }>();
  for (const b of badges) {
    const season = Number(b.season.slice(1));
    const seen = byAward.get(b.award);
    if (!seen) byAward.set(b.award, { latest: b, season, times: 1 });
    else {
      seen.times += 1;
      if (season > seen.season) Object.assign(seen, { latest: b, season });
    }
  }
  return [...byAward.values()]
    .sort(
      (x, y) =>
        Number(x.latest.joke) - Number(y.latest.joke) ||
        y.season - x.season ||
        AWARD_ORDER.indexOf(x.latest.award) - AWARD_ORDER.indexOf(y.latest.award)
    )
    .map(({ latest, times }) => ({
      award: latest.award,
      title: latest.title,
      icon: latest.icon,
      joke: latest.joke,
      where: `${latest.scope} · ${latest.season}${times > 1 ? ` · ${times}×` : ""}`,
    }));
}

/** The award's title, or null for no title or one this build doesn't know. */
export function titleName(award: string | null | undefined): string | null {
  return award && award in AWARDS ? AWARDS[award as AwardId].title : null;
}

/** The line under the rank: "Pro record 3-1 · Round Sniper". Null while the
 * career is loading. */
export function profileLine(career: Pick<Career, "cards" | "record"> | null, title: string | null): string | null {
  if (!career) return null;
  if (career.cards === 0) return "No fights yet";
  return `Pro record ${career.record}${title ? ` · ${title}` : ""}`;
}

async function db() {
  return (await import("./supabase")).supabase;
}

// The last title read for each player this session, so a profile opened again
// shows it straight away while a fresh copy loads.
const lastRead = new Map<string, AwardId | null>();

/** The title last read for a player, or undefined if it hasn't been. */
export function cachedTitle(userId: string): AwardId | null | undefined {
  return lastRead.get(userId);
}

/** The award a player wears as their title; null with none, or before the server has titles. */
export async function loadTitle(userId: string): Promise<AwardId | null> {
  const { data, error } = await (await db()).rpc("player_title", { member: userId });
  if (error) return null;
  const title = typeof data === "string" && data in AWARDS ? (data as AwardId) : null;
  lastRead.set(userId, title);
  return title;
}

/** Wear an award you've won; null takes the title off. */
export async function saveTitle(award: AwardId | null): Promise<void> {
  const { error } = await (await db()).rpc("set_profile_title", { award });
  if (error) throw new Error(error.message);
}
