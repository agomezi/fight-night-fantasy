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
export const LEAGUE: League | null = null;

export const SEASON_STANDINGS: Standing[] = [];

export const EVENT_STANDINGS: Standing[] = [];

export const RIVALRY: Rivalry | null = null;

export const MATCHUP_PICKS: MatchupPick[] = [];

export const RISING_STARS: Riser[] = [];

export const CHATTER: ChatMessage[] = [];

export const LEAGUE_STATS: LeagueStat[] = [
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

export const RECENT_RESULTS: BoutResult[] = [];

/** Accuracy for the event currently in view. Null until something is scored. */
export const EVENT_ACCURACY: { hit: number; total: number } | null = null;
