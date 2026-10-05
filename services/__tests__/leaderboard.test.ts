import { toLeaderboard } from "../leaderboard";

const raw = (rank: number, name: string, points: number, correct: number, counted: number, isMe = false) => ({
  rank,
  user_id: `u-${name}`,
  display_name: name,
  points,
  correct,
  counted,
  cards: 1,
  is_me: isMe,
  season_label: "SEASON 1",
});

describe("toLeaderboard", () => {
  test("shapes rows with accuracy as a whole percentage", () => {
    const board = toLeaderboard([raw(1, "Bravo", 100, 2, 3), raw(2, "Alpha", 50, 0, 0, true)]);
    expect(board.season).toBe("SEASON 1");
    expect(board.rows.map((r) => [r.rank, r.name, r.points, r.accuracy])).toEqual([
      [1, "Bravo", 100, 67],
      [2, "Alpha", 50, null],
    ]);
    expect(board.me?.name).toBe("Alpha");
  });

  test("players level on points and accuracy share a rank", () => {
    const board = toLeaderboard([raw(1, "Bravo", 100, 2, 2), raw(1, "Alpha", 100, 2, 2), raw(3, "Charlie", 50, 1, 2)]);
    expect(board.rows.map((r) => [r.rank, r.tied])).toEqual([[1, true], [1, true], [3, false]]);
  });

  test("an empty board is pre-season with no row for you", () => {
    expect(toLeaderboard([])).toEqual({ season: "PRE-SEASON", rows: [], me: null });
  });
});
