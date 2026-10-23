// What changed, shown once when the app opens after an update. Add a new
// entry at the top with a new id for each release worth telling players
// about. The card shows the newest entries an account hasn't seen yet, once
// per account on any phone, and points to Patch Notes for the rest.

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
    id: "2026-10-community",
    date: "2026-10-23T12:00:00Z",
    title: "Community takes",
    items: [
      {
        icon: "chatbubbles",
        title: "Takes that count",
        body: "Vote yes or no on a take about the card. You see the split once you vote, and it settles once the result is in.",
      },
      {
        icon: "podium",
        title: "Top performers and league cards",
        body: "After a card, see its best scorers and the boldest call that landed. Between cards, your league's top predictor, its craftiest pick, and whoever finished last.",
      },
      {
        icon: "checkmark-done",
        title: "Your takes record",
        body: "Every take you call right or wrong goes on your profile.",
      },
    ],
  },
  {
    id: "2026-10-awards",
    date: "2026-10-22T12:00:00Z",
    title: "Awards are coming",
    items: [
      {
        icon: "trophy",
        title: "League awards",
        body: "At each review your league crowns an Interim Champ and hands out awards: The Finisher, Upset Artist, Round Sniper and more.",
      },
      {
        icon: "podium",
        title: "P4P #1",
        body: "The top of the global board is the P4P #1. Your row shows how much edge you need to pass the player above you.",
      },
      {
        icon: "ribbon",
        title: "Season badges",
        body: "Mid-season awards are announced in your league. Awards won at the end of a season lock in as badges on your profile.",
      },
    ],
  },
  {
    id: "2026-10-pins-and-picks",
    date: "2026-10-20T12:00:00Z",
    title: "Pin your best calls",
    items: [
      {
        icon: "pin",
        title: "Pinned calls",
        body: "Pin up to 3 of your best calls from History. They show on your profile and on your card when anyone taps your name.",
      },
      {
        icon: "pricetag",
        title: "Know what each fight counts for",
        body: "On the picks screen, fights you still need show which league needs them, and main card fights show that they count for global.",
      },
      {
        icon: "podium",
        title: "Global, at a glance",
        body: "A line under the card tells you whether it will count on the global leaderboard, and how many main card fights you have left.",
      },
    ],
  },
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

/** How many entries the card shows at most; older ones wait in Patch Notes. */
export const WHATS_NEW_CAP = 2;

/** The entries to show, newest first: the newest few (up to the cap) newer
 * than the last this account closed, from after the account was made, and
 * how many more unseen ones the cap left out. */
export function whatsNewToShow(
  seenId: string | null | undefined,
  accountCreatedAt: string | null | undefined,
  entries: WhatsNewEntry[] = WHATS_NEW,
  cap: number = WHATS_NEW_CAP
): { show: WhatsNewEntry[]; missed: number } {
  const seenAt = entries.findIndex((e) => e.id === seenId);
  let unseen = seenAt < 0 ? entries : entries.slice(0, seenAt);
  if (accountCreatedAt) {
    const made = new Date(accountCreatedAt).getTime();
    unseen = unseen.filter((e) => new Date(e.date).getTime() > made);
  }
  return { show: unseen.slice(0, cap), missed: Math.max(0, unseen.length - cap) };
}
