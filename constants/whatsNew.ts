// What changed, shown once when the app opens after an update. Add a new
// entry at the top with a new id for each release worth telling players
// about. The card shows every entry an account hasn't seen yet, once per
// account on each phone.

import type { Ionicons } from "@expo/vector-icons";

export type WhatsNewItem = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

export type WhatsNewEntry = {
  id: string;
  /** Accounts made after this didn't know the old way, so they aren't shown it. */
  date: string;
  title: string;
  items: WhatsNewItem[];
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-10-global-edge",
    date: "2026-10-19T12:00:00Z",
    title: "A new global leaderboard",
    items: [
      {
        icon: "podium",
        title: "Ranked by edge",
        body: "The global leaderboard now ranks by edge: how many points you score above the average player on the same fights. Beat the field fight after fight and you climb.",
      },
      {
        icon: "albums",
        title: "Pick the whole main card",
        body: "A card counts once you've picked its whole main card. Prelims you add count too. Skipping never costs you points; it just doesn't count.",
      },
      {
        icon: "shield-checkmark",
        title: "A bad night won't sink you",
        body: "When everyone gets a fight wrong, nobody loses edge on it. An average night leaves you right around zero.",
      },
    ],
  },
  {
    id: "2026-10-league-rules",
    date: "2026-10-19T00:00:00Z",
    title: "New league rules",
    items: [
      {
        icon: "list",
        title: "Minimum picks",
        body: "Pro league owners now set how much of the card everyone has to pick: the main card unless they change it. Miss it and you lose that week's matchup.",
      },
      {
        icon: "flag",
        title: "Forfeits count half",
        body: "Beating someone who didn't make their picks is still a win, but only half a win in the standings.",
      },
      {
        icon: "timer",
        title: "Round calls cost less",
        body: "A wrong round now costs 5 points instead of 15, so calling the round is worth the risk.",
      },
      {
        icon: "swap-vertical",
        title: "Matchup alerts",
        body: "Get a push when the lead in your head-to-head changes hands, and where you stand as the main card starts.",
      },
    ],
  },
];

/** The entries to show, newest first: every one newer than the last this
 * account closed, from after the account was made. Empty when there's
 * nothing new. */
export function whatsNewToShow(
  seenId: string | null,
  accountCreatedAt: string | null | undefined,
  entries: WhatsNewEntry[] = WHATS_NEW
): WhatsNewEntry[] {
  const seenAt = entries.findIndex((e) => e.id === seenId);
  const unseen = seenAt < 0 ? entries : entries.slice(0, seenAt);
  if (!accountCreatedAt) return unseen;
  const made = new Date(accountCreatedAt).getTime();
  return unseen.filter((e) => new Date(e.date).getTime() > made);
}
