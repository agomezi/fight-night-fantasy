import { clock, hasStats, heroFor, statRows, statusLabel, type BoutStats } from "../fightStats";
import { parseFightStats } from "../ingestion/fightStats";

const parsed = parseFightStats(require("../ingestion/__fixtures__/live-stats/fight-13002-final.json"))!;
const stats: BoutStats = { ...parsed, live: false, round: null, clock: null, updatedAt: "2026-10-18T03:00:00Z" };

describe("statRows", () => {
  test("whole fight", () => {
    const rows = statRows(stats, null);
    expect(rows.map(r => r.label)).toEqual(["Total strikes", "Knockdowns", "Takedowns", "Control", "Sub attempts", "Sig. accuracy"]);
    expect(rows[0]).toMatchObject({ red: "20/59", blue: "38/51", redNote: "34%", blueNote: "75%", empty: false });
    expect(rows[0].redShare).toBeCloseTo(20 / 58);
    expect(rows[2]).toMatchObject({ red: "0/0", redShare: 0.5, empty: true });
    expect(rows[3]).toMatchObject({ red: "0:08", blue: "1:25" });
    expect(rows[5]).toMatchObject({ red: "26%", blue: "74%" });
    expect(rows[5].redShare).toBeCloseTo((14 / 53) / (14 / 53 + 37 / 50));
  });

  test("one round, and a round that didn't happen", () => {
    expect(statRows(stats, 2)[1]).toMatchObject({ red: "0", blue: "1", redShare: 0, empty: false });
    expect(statRows(stats, 3)).toEqual([]);
  });

  test("accuracy with nothing thrown", () => {
    const zero = { ...stats.red, sig: [0, 0] as [number, number] };
    const row = statRows({ ...stats, red: zero, blue: zero }, null)[5];
    expect(row).toMatchObject({ red: "—", blue: "—", redShare: 0.5, empty: true });
  });
});

test("heroFor", () => {
  expect(heroFor(stats, null)).toMatchObject({ red: 14, blue: 37 });
  expect(heroFor(stats, 1)).toMatchObject({ red: 9, blue: 15 });
  expect(heroFor(stats, 1)!.redShare).toBeCloseTo(9 / 24);
  expect(heroFor(stats, 4)).toBeNull();
});

test("hasStats", () => {
  expect(hasStats({ state: "live", result: null }, false)).toBe(true);
  expect(hasStats({ state: "final", result: "KO/TKO · R2 3:41" }, true)).toBe(true);
  expect(hasStats({ state: "final", result: "KO/TKO · R2 3:41" }, false)).toBe(false);
  expect(hasStats({ state: "provisional", result: "Decision" }, true)).toBe(true);
  expect(hasStats({ state: "pending", result: null }, true)).toBe(true);
  expect(hasStats({ state: "pending", result: null }, false)).toBe(false);
  expect(hasStats({ state: "void", result: "No contest" }, true)).toBe(true);
  expect(hasStats({ state: "void", result: "Draw" }, true)).toBe(true);
  expect(hasStats({ state: "void", result: "Cancelled" }, true)).toBe(false);
  expect(hasStats({ state: "void", result: "Void" }, true)).toBe(false);
  expect(hasStats({ state: "upcoming", result: null }, true)).toBe(false);
  expect(hasStats({ state: "cancelled", result: "Cancelled" }, true)).toBe(false);
});

test("statusLabel", () => {
  expect(statusLabel(stats)).toBe("OFFICIAL");
  expect(statusLabel({ ...stats, official: false })).toBe("UNOFFICIAL");
  expect(statusLabel({ ...stats, live: true, round: 2, clock: "3:14" })).toBe("LIVE · R2 3:14");
  expect(statusLabel({ ...stats, live: true })).toBe("LIVE");
});

test("clock", () => {
  expect(clock(85)).toBe("1:25");
  expect(clock(0)).toBe("0:00");
});
