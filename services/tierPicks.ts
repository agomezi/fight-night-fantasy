// Which part of the card each league tier plays, and what it must pick.
// Mirrors bout_counts_for_tier and met_tier_picks in the database, which
// decide the matchups; this tells the picks screen what to ask for first.
//
//   Casual    the main card                         every bout of it
//   Amateur   main card + the last 3 prelims        every bout of it
//   Pro and   the whole card                        what the owner sets: the
//   Hardcore                                        main event, the main card,
//                                                   the whole card or the top N

import type { LeagueTier, PickRule } from "./leagues";

export type TierBout = {
  id: string;
  /** Null for a bout entered by hand, which counts as main card. */
  segment: "main" | "prelims" | "early_prelims" | null;
};

/** The bouts `tier` plays, from a card ordered main event first. */
export function tierBouts<T extends TierBout>(tier: LeagueTier, card: T[]): T[] {
  if (tier === "pro" || tier === "hardcore") return card;
  const main = card.filter((b) => b.segment === "main" || b.segment === null);
  if (tier === "casual") return main;
  // The three prelims nearest the main card: the first three listed.
  const prelims = card.filter((b) => b.segment === "prelims").slice(0, 3);
  return card.filter((b) => main.includes(b) || prelims.includes(b));
}

/** The bouts a league requires picked. Mirrors league_required_bouts. */
export function requiredBouts<T extends TierBout>(tier: LeagueTier, card: T[], rule?: PickRule | null): T[] {
  if (tier !== "pro" && tier !== "hardcore") return tierBouts(tier, card);
  const scope = rule?.scope ?? "main_event";
  if (scope === "whole_card") return card;
  if (scope === "main_card") return card.filter((b, i) => i === 0 || b.segment === "main" || b.segment === null);
  if (scope === "top_n") return card.slice(0, rule?.topN ?? 1);
  return card.slice(0, 1);
}

export type TierNeed = {
  /** Required bouts still open and not picked yet. */
  missing: string[];
  /** The league asking for the most of them, to name on the button. */
  league: string | null;
};

/**
 * What your leagues still need picked before you lock in: every league's
 * required bouts together, leaving out any that have already locked, since
 * those can't be picked any more. The main event is always required.
 */
export function lockInNeeds<T extends TierBout>(
  leagues: { name: string; tier: LeagueTier; rule?: PickRule | null }[],
  card: T[],
  picked: (id: string) => boolean,
  open: (bout: T) => boolean
): TierNeed {
  const stillNeeded = (bouts: T[]) => bouts.filter((b) => open(b) && !picked(b.id));
  const missing = new Set(stillNeeded(card.slice(0, 1)).map((b) => b.id));
  let league: string | null = null;
  let most = 0;
  for (const l of leagues) {
    const need = stillNeeded(requiredBouts(l.tier, card, l.rule));
    need.forEach((b) => missing.add(b.id));
    if (need.length > most) {
      most = need.length;
      league = l.name;
    }
  }
  return { missing: [...missing], league };
}
