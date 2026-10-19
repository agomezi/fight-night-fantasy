// The global season leaderboard, ranked by edge: on each fight you pick,
// your points minus the average of everyone who picked it, summed, over
// cards where you picked the whole main card. The shaping is pure so it can
// be tested without a database.

export type LeaderboardRow = {
  /** Null for a player scored this season with no card counted yet, listed after everyone ranked. */
  rank: number | null;
  /** True when another player shares the rank, shown as T-n. */
  tied: boolean;
  userId: string;
  name: string;
  /** Points above the average player on the same fights; what the board ranks by. Null when unranked. */
  edge: number | null;
  /** Season points over every pick. */
  points: number;
  /** 0–100, or null before anything has been scored. */
  accuracy: number | null;
  correct: number;
  counted: number;
  /** Cards that counted: the whole main card picked. */
  cards: number;
  isMe: boolean;
};

export type Leaderboard = { season: string; rows: LeaderboardRow[]; me: LeaderboardRow | null };

type Raw = {
  rank: number | null;
  user_id: string;
  display_name: string;
  edge?: number | null;
  points: number;
  correct: number;
  counted: number;
  cards: number;
  is_me: boolean;
  season_label: string;
};

export function toLeaderboard(raw: Raw[]): Leaderboard {
  const shared = new Map<number, number>();
  for (const r of raw) if (r.rank != null) shared.set(Number(r.rank), (shared.get(Number(r.rank)) ?? 0) + 1);
  const rows = raw.map((r) => ({
    rank: r.rank == null ? null : Number(r.rank),
    tied: r.rank != null && (shared.get(Number(r.rank)) ?? 0) > 1,
    userId: r.user_id,
    name: r.display_name,
    // Before the server ranks by edge (no field at all), the board is by points.
    edge: r.edge === undefined ? Number(r.points) : r.edge == null ? null : Number(r.edge),
    points: Number(r.points),
    accuracy: Number(r.counted) > 0 ? Math.round((Number(r.correct) / Number(r.counted)) * 100) : null,
    correct: Number(r.correct),
    counted: Number(r.counted),
    cards: Number(r.cards),
    isMe: r.is_me,
  }));
  return { season: raw[0]?.season_label ?? "PRE-SEASON", rows, me: rows.find((r) => r.isMe) ?? null };
}

export async function loadLeaderboard(maxRows = 100): Promise<Leaderboard> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("season_leaderboard", { max_rows: maxRows });
  if (error) throw new Error(error.message);
  return toLeaderboard((data ?? []) as Raw[]);
}
