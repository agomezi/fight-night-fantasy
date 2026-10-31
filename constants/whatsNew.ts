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
    id: "2026-10-title-fights",
    date: "2026-10-29T12:00:00Z",
    title: "Title fights",
    items: [
      {
        icon: "trophy",
        title: "A belt for every league",
        body: "After card 8 the top five get a title shot: a play-in on card 9, semifinals on card 10, and the title fight on card 11. A tie goes to the better seed. Leagues of four or five send their top four straight to the semis.",
      },
      {
        icon: "shield",
        title: "Defend it every card",
        body: "The Champion sits above the table and carries the belt into next season. Every matchup they play is a title fight: win and it's a defense, lose and the title is vacant. While it's vacant, the mid-season review names the table's #1 Interim Champ, and card 11's title fight crowns the next Champion.",
      },
    ],
  },
  {
    id: "2026-10-tier-upgrade",
    date: "2026-10-28T12:00:00Z",
    title: "Leagues can move up",
    items: [
      {
        icon: "trending-up",
        title: "Move your league up a tier",
        body: "Owners can move a Casual or Amateur league up a tier in league settings. It starts next season, this season's cards stay as they are, and a league never moves back down.",
      },
    ],
  },
  {
    id: "2026-10-belts-badges",
    date: "2026-10-28T12:00:00Z",
    title: "Belts and badges",
    items: [
      {
        icon: "fitness",
        title: "Earn your belt",
        body: "Your career rank is now a belt, white to red. Stripes on the tip show how close the next one is.",
      },
      {
        icon: "medal",
        title: "Rare badges",
        body: "Gold badges for the rare stuff, like playing every card of a season or running a league through one. They sit on your profile card, and anyone who opens your card sees them.",
      },
      {
        icon: "eye-off",
        title: "Your locker",
        body: "Edit Profile has a locker with a switch for your belt and each badge, if you'd rather not show one.",
      },
    ],
  },
  {
    id: "2026-10-profile-titles",
    date: "2026-10-28T12:00:00Z",
    title: "Wear your awards",
    items: [
      {
        icon: "ribbon",
        title: "Titles you earn",
        body: "Win an award at a season's final drop and you can wear it as your title, next to your pro record. Pick it in Edit Profile, and anyone who opens your card sees it.",
      },
    ],
  },
  {
    id: "2026-10-name-review",
    date: "2026-10-27T12:00:00Z",
    title: "Names under review",
    items: [
      {
        icon: "person-circle",
        title: "Tell hidden players apart",
        body: "When enough players report a name, it's hidden while a moderator checks it. It now shows as \"Player\" with a number, like Player #4821, so two hidden players never look the same.",
      },
      {
        icon: "create",
        title: "Rename on the spot",
        body: "If it's your name, you can pick a new one straight away and everyone sees it. If the old one turns out fine, you get it back.",
      },
    ],
  },
  {
    id: "2026-10-league-onboarding",
    date: "2026-10-25T18:00:00Z",
    title: "League rules up front",
    items: [
      {
        icon: "book",
        title: "Read the rules before you join",
        body: "Joining with a code now shows the league's rules first: its size, doubleheaders, and the minimum picks. Tap Rules on the league page to see them again.",
      },
      {
        icon: "checkbox",
        title: "A checklist for owners",
        body: "New leagues get a short checklist before the first card: invite enough players, choose the minimum picks, and what an odd number of players means.",
      },
    ],
  },
  {
    id: "2026-10-round-ten",
    date: "2026-10-25T12:00:00Z",
    title: "Round calls cost more",
    items: [
      {
        icon: "timer",
        title: "A wrong round costs 10",
        body: "From the Oct 31 card on, a wrong round costs 10 points instead of 5 (5 in Casual). Cards already played keep their scores.",
      },
    ],
  },
  {
    id: "2026-10-live-stats",
    date: "2026-10-25T12:00:00Z",
    title: "Live fight stats",
    items: [
      {
        icon: "stats-chart",
        title: "Tale of the tape",
        body: "Tap a live or finished fight on the card to see sig. strikes, takedowns, knockdowns and control time side by side, for the whole fight or round by round.",
      },
      {
        icon: "pulse",
        title: "Live, then official",
        body: "The numbers update while the fight is on and turn official once the UFC confirms them. Your pick sits right above them.",
      },
    ],
  },
  {
    id: "2026-10-matchup-picks",
    date: "2026-10-25T12:00:00Z",
    title: "Scout the whole league",
    items: [
      {
        icon: "eye",
        title: "Every matchup's picks",
        body: "On the head-to-head screen, tap VS on any matchup in your league to see both sides' picks. They show as each part of the card starts, the same as your opponent's.",
      },
      {
        icon: "chatbubbles",
        title: "New question alerts",
        body: "Get a heads-up when a new community question goes up, every few days at most. Turn it off in Settings.",
      },
    ],
  },
  {
    id: "2026-10-records",
    date: "2026-10-24T12:00:00Z",
    title: "Standings are about your record",
    items: [
      {
        icon: "podium",
        title: "Record first",
        body: "League standings show your record and your current streak. Points still decide this week's matchup and break ties in the table.",
      },
      {
        icon: "time",
        title: "Small fixes from fight night",
        body: "History now only lists fights once they're scored, and a vote that doesn't go through tells you so.",
      },
    ],
  },
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
        title: "Top performers and crowd vs. reality",
        body: "After a card, see its best scorers, the boldest call that landed, and the fight the crowd got most wrong. Your league's page shows its top predictor, its craftiest pick, and whoever finished last.",
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

/** The newer of two seen ids: whichever sits higher in the list. An id
 * this build doesn't know counts as nothing. */
export function newerSeen(
  a: string | null | undefined,
  b: string | null | undefined,
  entries: WhatsNewEntry[] = WHATS_NEW
): string | null {
  const at = (id: string | null | undefined) => (id ? entries.findIndex((e) => e.id === id) : -1);
  const ia = at(a);
  const ib = at(b);
  if (ia < 0) return ib < 0 ? null : b!;
  if (ib < 0) return a!;
  return ia <= ib ? a! : b!;
}

/** The seen id to save on the account, or null to leave it: only ever moves
 * it forward. An id this build doesn't know came from a newer build, so it's
 * left alone. */
export function seenToSave(
  account: string | null | undefined,
  next: string | null | undefined,
  entries: WhatsNewEntry[] = WHATS_NEW
): string | null {
  if (account && !entries.some((e) => e.id === account)) return null;
  const save = newerSeen(account, next, entries);
  return save && save !== account ? save : null;
}

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
