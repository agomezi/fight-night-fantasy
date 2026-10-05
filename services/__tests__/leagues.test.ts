import {
  currentWeek,
  matchupOutcome,
  rankLabel,
  recordOf,
  toMyLeagues,
  toStandings,
  toWeeks,
  type MatchupState,
  type MemberStatus,
} from "../leagues";

const standing = (rank: number | null, name: string, extra: Partial<Record<string, unknown>> = {}) => ({
  rank,
  user_id: `u-${name}`,
  display_name: name,
  status: (rank == null ? "queued" : "active") as MemberStatus,
  wins: 1,
  losses: 1,
  draws: 0,
  points: 100,
  correct: 2,
  counted: 3,
  is_me: false,
  is_owner: false,
  season_label: "SEASON 1",
  ...extra,
});

const matchup = (week: number, a: string, b: string | null, extra: Partial<Record<string, unknown>> = {}) => ({
  week,
  event_id: `e${week}`,
  event_name: `Card ${week}`,
  state: "final" as MatchupState,
  user_a: a,
  name_a: a.toUpperCase(),
  points_a: 100,
  user_b: b,
  name_b: b?.toUpperCase() ?? null,
  points_b: b ? 50 : null,
  winner: a,
  is_mine: false,
  ...extra,
});

describe("recordOf and rankLabel", () => {
  test("a record only shows draws when there are some", () => {
    expect(recordOf(3, 1, 0)).toBe("3-1");
    expect(recordOf(3, 1, 2)).toBe("3-1-2");
  });

  test("a shared rank reads T-n and no rank reads as a dash", () => {
    expect(rankLabel(2)).toBe("2");
    expect(rankLabel(2, true)).toBe("T-2");
    expect(rankLabel(null)).toBe("—");
  });
});

describe("toMyLeagues", () => {
  test("shapes a league with an upper-case code and a record", () => {
    const [league] = toMyLeagues([
      {
        league_id: "l1", name: "Alpha", tier: "casual", invite_code: "ab12cd34", is_owner: true, members: 5,
        my_status: "active", my_rank: 2, wins: 3, losses: 1, draws: 1, points: 240,
      },
    ]);
    expect(league).toEqual({
      id: "l1", name: "Alpha", tier: "casual", inviteCode: "AB12CD34", isOwner: true, members: 5,
      status: "active", rank: 2, record: "3-1-1", points: 240,
    });
  });
});

describe("toStandings", () => {
  test("marks shared ranks, works out accuracy and finds you", () => {
    const board = toStandings([
      standing(1, "Alpha"),
      standing(1, "Bravo", { is_me: true }),
      standing(3, "Charlie", { counted: 0, correct: 0 }),
      standing(null, "Delta"),
    ]);
    expect(board.rows.map((r) => [r.rank, r.tied, r.name, r.accuracy])).toEqual([
      [1, true, "Alpha", 67],
      [1, true, "Bravo", 67],
      [3, false, "Charlie", null],
      [null, false, "Delta", 67],
    ]);
    expect(board.ranked).toBe(true);
    expect(board.me?.name).toBe("Bravo");
  });

  test("before a ranked season nobody has a rank", () => {
    const board = toStandings([standing(null, "Alpha", { season_label: "PRE-SEASON" })]);
    expect(board).toMatchObject({ season: "PRE-SEASON", ranked: false });
  });
});

describe("toWeeks", () => {
  test("groups by week, puts your matchup first and you on side a", () => {
    const weeks = toWeeks(
      [
        matchup(1, "x", "y"),
        matchup(1, "z", "me", { is_mine: true, winner: "me", points_a: 10, points_b: 90 }),
        matchup(2, "me", null, { is_mine: true, state: "upcoming", points_a: null, winner: null }),
      ],
      "me"
    );
    expect(weeks.map((w) => [w.week, w.matchups.length])).toEqual([[1, 2], [2, 1]]);
    const mine = weeks[0].matchups[0];
    expect(mine.isMine).toBe(true);
    expect(mine.a).toEqual({ userId: "me", name: "ME", points: 90 });
    expect(mine.b).toEqual({ userId: "z", name: "Z", points: 10 });
    expect(matchupOutcome(mine)).toBe("won");
    expect(weeks[1].matchups[0].b).toBeNull();
  });
});

describe("currentWeek", () => {
  const week = (n: number, state: MatchupState) => toWeeks([matchup(n, "a", "b", { state })], null)[0];

  test("prefers a live week, then the next upcoming, then the last", () => {
    expect(currentWeek([week(1, "final"), week(2, "live"), week(3, "upcoming")])?.week).toBe(2);
    expect(currentWeek([week(1, "final"), week(2, "upcoming")])?.week).toBe(2);
    expect(currentWeek([week(1, "final"), week(2, "final")])?.week).toBe(2);
    expect(currentWeek([])).toBeNull();
  });
});

describe("matchupOutcome", () => {
  const [{ matchups: [m] }] = toWeeks([matchup(1, "me", "you", { is_mine: true })], "me");

  test("reads a final, a live score and a draw from your side", () => {
    expect(matchupOutcome(m)).toBe("won");
    expect(matchupOutcome({ ...m, state: "live" })).toBe("leading");
    expect(matchupOutcome({ ...m, state: "live", a: { ...m.a, points: 50 } })).toBe("level");
    expect(matchupOutcome({ ...m, winnerId: null })).toBe("drew");
    expect(matchupOutcome({ ...m, b: null })).toBeNull();
  });
});
