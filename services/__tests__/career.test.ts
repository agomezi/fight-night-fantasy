import { rankFor, toCareer } from "../career";
import { toLeagueRecords, toSeasonRecords } from "../leagues";

const raw = (extra: Partial<Record<string, number>> = {}) => ({
  wins: 0,
  losses: 0,
  draws: 0,
  cards: 0,
  streak: 0,
  career_points: 0,
  ...extra,
});

describe("rankFor", () => {
  it("starts each rank at its threshold", () => {
    expect(rankFor(0)).toBe("Prospect");
    expect(rankFor(4)).toBe("Prospect");
    expect(rankFor(5)).toBe("Contender");
    expect(rankFor(15)).toBe("Ranked");
    expect(rankFor(35)).toBe("Title Challenger");
    expect(rankFor(59)).toBe("Title Challenger");
    expect(rankFor(60)).toBe("Champion");
    expect(rankFor(150)).toBe("Legend");
    expect(rankFor(999)).toBe("Legend");
  });
});

describe("toCareer", () => {
  it("is a Prospect with no record when nothing comes back", () => {
    const c = toCareer([]);
    expect(c).toMatchObject({ record: "0-0", cards: 0, rank: "Prospect", nextRank: "Contender", toNext: 5, progress: 0 });
    expect(c.streakLabel).toBeNull();
  });

  it("shows draws only when there are some", () => {
    expect(toCareer([raw({ wins: 14, losses: 6 })]).record).toBe("14-6");
    expect(toCareer([raw({ wins: 14, losses: 6, draws: 1 })]).record).toBe("14-6-1");
  });

  it("labels a streak from two in a row", () => {
    expect(toCareer([raw({ streak: 1 })]).streakLabel).toBeNull();
    expect(toCareer([raw({ streak: 3 })]).streakLabel).toBe("W3");
    expect(toCareer([raw({ streak: -2 })]).streakLabel).toBe("L2");
  });

  it("measures progress through the current rank", () => {
    const c = toCareer([raw({ career_points: 25 })]);
    expect(c).toMatchObject({ rank: "Ranked", nextRank: "Title Challenger", toNext: 10, progress: 0.5 });
  });

  it("has nowhere to go at Legend", () => {
    expect(toCareer([raw({ career_points: 200 })])).toMatchObject({ rank: "Legend", nextRank: null, toNext: null, progress: 1 });
  });
});

describe("league records", () => {
  it("gives this season and all time per league", () => {
    expect(
      toLeagueRecords([
        { league_id: "l1", name: "Crew", season_wins: 3, season_losses: 1, season_draws: 0, wins: 8, losses: 8, draws: 1 },
      ])
    ).toEqual([{ leagueId: "l1", name: "Crew", season: "3-1", allTime: "8-8-1", played: 17 }]);
  });

  it("names season 0 the pre-season", () => {
    expect(
      toSeasonRecords([
        { season: 2, wins: 8, losses: 0, draws: 0 },
        { season: 0, wins: 0, losses: 6, draws: 0 },
      ])
    ).toEqual([
      { season: 2, label: "Season 2", record: "8-0" },
      { season: 0, label: "Pre-season", record: "0-6" },
    ]);
  });
});
