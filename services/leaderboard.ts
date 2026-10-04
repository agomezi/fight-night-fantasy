// The global season leaderboard, and reporting a name on it. The shaping is
// pure so it can be tested without a database.

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  points: number;
  /** 0–100, or null before anything has been scored. */
  accuracy: number | null;
  correct: number;
  counted: number;
  cards: number;
  isMe: boolean;
};

export type Leaderboard = { season: string; rows: LeaderboardRow[]; me: LeaderboardRow | null };

type Raw = {
  rank: number;
  user_id: string;
  display_name: string;
  points: number;
  correct: number;
  counted: number;
  cards: number;
  is_me: boolean;
  season_label: string;
};

export function toLeaderboard(raw: Raw[]): Leaderboard {
  const rows = raw.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    name: r.display_name,
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

/** Reports a player's current name for review. Repeating it adds nothing. */
export async function reportName(userId: string, reason = "offensive name"): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.rpc("report_display_name", { reported: userId, reason });
  if (error) throw new Error(error.message);
}
