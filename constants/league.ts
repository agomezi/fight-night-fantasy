export type Standing = {
  id: string;
  rank: number;
  name: string;
  team: string;
  points: number;
  move: number; // positive = climbed, negative = dropped, 0 = held
  isMe?: boolean;
};

export type League = {
  name: string;
  kind: string;
  members: number;
  week: number;
};

export type Rivalry = {
  you: { name: string; team: string; proj: number; record: string; live: number };
  rival: { name: string; team: string; proj: number; record: string; live: number };
  gap: number;
  event: string;
};

export type MatchupPick = {
  id: string;
  bout: string;
  yourPick: string;
  yourMethod: string;
  yourPoints: number;
  rivalPick: string;
  rivalMethod: string;
  rivalPoints: number;
  status: "FINAL" | "LIVE" | "UPCOMING";
};

export type Riser = { id: string; name: string; sub: string; delta: string };

export type ChatMessage = { id: string; author: string; time: string; text: string };

export type LeagueStat = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean | null;
};

// A brand-new account has not joined a league and has no scored picks yet, so
// every collection below is intentionally empty. Screens branch on these to
// render their empty states instead of fabricating numbers we don't have.
/*
 * DEMO SWITCH
 *
 * false — the real shipping state: a brand-new account, everything empty.
 * true  — sample data, so populated screens can be designed and reviewed.
 *
 * Flip this one line; nothing else changes. The empty-state work stays intact
 * either way. Remove the demo branches once a backend supplies this.
 */
export const DEMO = true;

export const LEAGUE: League | null = DEMO
  ? { name: "The Alpha League", kind: "PRIVATE LEAGUE", members: 12, week: 7 }
  : null;

export const SEASON_STANDINGS: Standing[] = DEMO
  ? [
      { id: "dave", rank: 1, name: "Dave M.", team: "Striker Squad", points: 1235.0, move: 1 },
      { id: "me", rank: 2, name: "You", team: "Team Apex", points: 1180.5, move: 2, isMe: true },
      { id: "sarah", rank: 3, name: "Sarah J.", team: "Submission Artists", points: 1102.5, move: -1 },
      { id: "mike", rank: 4, name: "Mike K.", team: "Knockout Kings", points: 980.0, move: 0 },
      { id: "priya", rank: 5, name: "Priya K.", team: "Ground Control", points: 905.0, move: -2 },
      { id: "jordan", rank: 6, name: "Jordan M.", team: "The Octagon", points: 871.5, move: 1 },
    ]
  : [];

export const EVENT_STANDINGS: Standing[] = DEMO
  ? [
      { id: "me", rank: 1, name: "You", team: "Team Apex", points: 245.0, move: 3, isMe: true },
      { id: "dave", rank: 2, name: "Dave M.", team: "Striker Squad", points: 238.0, move: -1 },
      { id: "sofia", rank: 3, name: "Sofia R.", team: "Heavy Hitters", points: 231.0, move: 0 },
      { id: "priya", rank: 4, name: "Priya K.", team: "Ground Control", points: 205.0, move: -2 },
    ]
  : [];

export const RIVALRY: Rivalry | null = DEMO
  ? {
      you: { name: "You", team: "Team Apex", proj: 142.0, record: "5-1", live: 88.5 },
      rival: { name: "Dave", team: "Striker Squad", proj: 138.5, record: "5-1", live: 76.0 },
      gap: 12.5,
      event: "UFC 300",
    }
  : null;

export const MATCHUP_PICKS: MatchupPick[] = [];

export const RISING_STARS: Riser[] = DEMO
  ? [
      { id: "1", name: "Priya K.", sub: "Up 4 places this week", delta: "+42%" },
      { id: "2", name: "Jordan M.", sub: "Up 2 places this week", delta: "+18%" },
    ]
  : [];

export const CHATTER: ChatMessage[] = DEMO
  ? [
      {
        id: "1",
        author: "Dave M.",
        time: "2h ago",
        text: "I need a big night from the main event to hold you off.",
      },
      {
        id: "2",
        author: "Sarah J.",
        time: "5h ago",
        text: "Anyone else fading the favourite? Feels like a trap.",
      },
    ]
  : [];

export const LEAGUE_STATS: LeagueStat[] = DEMO
  ? [
      { id: "winrate", label: "YOUR WIN RATE", value: "83%", delta: "+2.4", positive: true },
      { id: "avg", label: "POINTS AVERAGE", value: "197", delta: "Stable", positive: null },
      { id: "accuracy", label: "PICK ACCURACY", value: "68%", delta: "-1.2", positive: false },
      { id: "percentile", label: "LEAGUE PERCENTILE", value: "TOP 17%", delta: "Rising", positive: true },
    ]
  : [
      { id: "winrate", label: "YOUR WIN RATE", value: "—", delta: "No events yet", positive: null },
      { id: "avg", label: "POINTS AVERAGE", value: "0", delta: "No events yet", positive: null },
      { id: "accuracy", label: "PICK ACCURACY", value: "—", delta: "No picks yet", positive: null },
      { id: "percentile", label: "LEAGUE PERCENTILE", value: "—", delta: "Unranked", positive: null },
    ];

/**
 * A read on how you pick, rather than a raw stat — the fantasy-league
 * superlative. Earned from your own history, so a new account has none yet.
 */
export type Superlative = {
  id: string;
  title: string;
  blurb: string;
};

export const SUPERLATIVE: Superlative | null = null;

/** Candidates, for reference once scoring exists. */
export const SUPERLATIVE_POOL: Superlative[] = [
  { id: "finisher", title: "The Finisher", blurb: "You almost never call a decision" },
  { id: "chalk", title: "Chalk Eater", blurb: "You back the favourite nearly every time" },
  { id: "dog", title: "Dog Merchant", blurb: "You live on underdogs" },
  { id: "sniper", title: "Round Sniper", blurb: "You call the round more often than anyone" },
  { id: "judge", title: "The Judge", blurb: "You see fights going the distance before they do" },
  { id: "cold", title: "Ice Cold", blurb: "Three events without a miss" },
];

/** A settled bout, shown in history. */
export type BoutResult = {
  id: string;
  event: string;
  red: { initials: string; name: string; method?: string };
  blue: { initials: string; name: string; method?: string };
  detail: string;
  points: string;
  verdict: "hit" | "miss" | "none";
  verdictNote: string;
};

export const RECENT_RESULTS: BoutResult[] = DEMO
  ? [
      {
        id: "r1",
        event: "UFC 299",
        red: { initials: "IM", name: "I. Makhachev", method: "SUB" },
        blue: { initials: "DP", name: "D. Poirier" },
        detail: "R3, 2:41",
        points: "+180",
        verdict: "hit",
        verdictNote: "YOU CALLED IT · R3",
      },
      {
        id: "r2",
        event: "UFC 299",
        red: { initials: "SO", name: "S. O'Malley", method: "UD" },
        blue: { initials: "MV", name: "M. Vera" },
        detail: "R5",
        points: "+110",
        verdict: "hit",
        verdictNote: "YOU CALLED IT",
      },
      {
        id: "r3",
        event: "UFC 299",
        red: { initials: "AP", name: "A. Pantoja" },
        blue: { initials: "SE", name: "S. Erceg", method: "KO/TKO" },
        detail: "R2, 4:08",
        points: "0",
        verdict: "miss",
        verdictNote: "YOU HAD PANTOJA",
      },
    ]
  : [];

/** Accuracy for the event currently in view. Null until something is scored. */
export const EVENT_ACCURACY: { hit: number; total: number } | null = null;

/** A settled event, with everything you called in it. */
export type PastEvent = {
  id: string;
  name: string;
  date: string;
  /** What you scored. */
  points: number;
  /** Bouts you called correctly, out of how many you picked. */
  hit: number;
  total: number;
  bouts: BoutResult[];
};

export const PAST_EVENTS: PastEvent[] = DEMO
  ? [
      {
        id: "ufc299",
        name: "UFC 299",
        date: "9 Mar",
        points: 218,
        hit: 8,
        total: 12,
        bouts: RECENT_RESULTS,
      },
      {
        id: "ufc298",
        name: "UFC 298",
        date: "17 Feb",
        points: 196,
        hit: 7,
        total: 11,
        bouts: [
          {
            id: "e298-1",
            event: "UFC 298",
            red: { initials: "IG", name: "I. Garry", method: "UD" },
            blue: { initials: "GB", name: "G. Buckley" },
            detail: "R3",
            points: "+95",
            verdict: "hit",
            verdictNote: "YOU CALLED IT",
          },
          {
            id: "e298-2",
            event: "UFC 298",
            red: { initials: "MM", name: "M. Merab" },
            blue: { initials: "HC", name: "H. Cejudo", method: "KO/TKO" },
            detail: "R1, 0:58",
            points: "0",
            verdict: "miss",
            verdictNote: "YOU HAD MERAB",
          },
        ],
      },
      {
        id: "ufc297",
        name: "UFC 297",
        date: "20 Jan",
        points: 174,
        hit: 6,
        total: 11,
        bouts: [
          {
            id: "e297-1",
            event: "UFC 297",
            red: { initials: "SS", name: "S. Strickland" },
            blue: { initials: "DD", name: "D. Du Plessis", method: "SD" },
            detail: "R5",
            points: "0",
            verdict: "miss",
            verdictNote: "YOU HAD STRICKLAND",
          },
        ],
      },
    ]
  : [];

/** Something that happened while you weren't looking. */
export type Notification = {
  id: string;
  /** Drives the mark and the accent. */
  kind: "result" | "league" | "matchup" | "reminder";
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

export const NOTIFICATIONS: Notification[] = DEMO
  ? [
      {
        id: "n1",
        kind: "reminder",
        title: "Your card locks in 14 hours",
        body: "5 bouts on UFC 300 still have no pick.",
        time: "2h",
        unread: true,
      },
      {
        id: "n2",
        kind: "matchup",
        title: "Dave M. pulled within 12.5",
        body: "He's picked the main event against you.",
        time: "5h",
        unread: true,
      },
      {
        id: "n3",
        kind: "result",
        title: "Makhachev by submission, R3",
        body: "You called it. +180 points.",
        time: "1d",
        unread: false,
      },
      {
        id: "n4",
        kind: "league",
        title: "Sarah J. joined The Alpha League",
        body: "12 members now competing.",
        time: "2d",
        unread: false,
      },
      {
        id: "n5",
        kind: "result",
        title: "UFC 299 scored",
        body: "You finished 2nd for the event with 218 points.",
        time: "3d",
        unread: false,
      },
    ]
  : [];
