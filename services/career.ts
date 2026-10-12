// Your career: a pro record that never resets (the top half of each card's
// main card win) and a rank that climbs with it. The shaping is pure so it
// can be tested without a database.

import { recordOf } from "./leagues";

export type CareerRank = "Prospect" | "Contender" | "Ranked" | "Title Challenger" | "Champion" | "Legend";

/** Career points each rank starts at: a point per card, another per win. */
export const RANKS: { rank: CareerRank; at: number }[] = [
  { rank: "Prospect", at: 0 },
  { rank: "Contender", at: 5 },
  { rank: "Ranked", at: 15 },
  { rank: "Title Challenger", at: 35 },
  { rank: "Champion", at: 60 },
  { rank: "Legend", at: 150 },
];

export type Career = {
  wins: number;
  losses: number;
  draws: number;
  cards: number;
  /** "14-6", or "14-6-1" with draws. */
  record: string;
  /** Wins (positive) or losses (negative) in a row, newest first. */
  streak: number;
  /** "W3" or "L2" from two in a row, otherwise null. */
  streakLabel: string | null;
  points: number;
  rank: CareerRank;
  nextRank: CareerRank | null;
  /** Career points still needed for the next rank; null at Legend. */
  toNext: number | null;
  /** 0–1 through the current rank toward the next; 1 at Legend. */
  progress: number;
};

type RawCareer = {
  wins: number;
  losses: number;
  draws: number;
  cards: number;
  streak: number;
  career_points: number;
};

export function rankFor(points: number): CareerRank {
  let rank: CareerRank = "Prospect";
  for (const r of RANKS) if (points >= r.at) rank = r.rank;
  return rank;
}

export function toCareer(raw: RawCareer[]): Career {
  const r = raw[0];
  const wins = Number(r?.wins ?? 0);
  const losses = Number(r?.losses ?? 0);
  const draws = Number(r?.draws ?? 0);
  const streak = Number(r?.streak ?? 0);
  const points = Number(r?.career_points ?? 0);
  const rank = rankFor(points);
  const i = RANKS.findIndex((x) => x.rank === rank);
  const next = RANKS[i + 1] ?? null;
  return {
    wins,
    losses,
    draws,
    cards: Number(r?.cards ?? 0),
    record: recordOf(wins, losses, draws),
    streak,
    streakLabel: streak >= 2 ? `W${streak}` : streak <= -2 ? `L${-streak}` : null,
    points,
    rank,
    nextRank: next?.rank ?? null,
    toNext: next ? next.at - points : null,
    progress: next ? (points - RANKS[i].at) / (next.at - RANKS[i].at) : 1,
  };
}

export async function loadCareer(): Promise<Career> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("my_career");
  if (error) throw new Error(error.message);
  return toCareer((data ?? []) as RawCareer[]);
}
