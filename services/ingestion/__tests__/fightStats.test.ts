import { parseFightStats, seconds } from "../fightStats";

// A finished fight from the per-fight file, saved 2026-10-23: Buckley (red)
// stopped by Malott (blue) with a knee in round 2.
const final = require("../__fixtures__/live-stats/fight-13002-final.json");
const clone = () => JSON.parse(JSON.stringify(final));

describe("parseFightStats", () => {
  test("reads totals per corner from a finished fight", () => {
    const s = parseFightStats(final)!;
    expect(s).toMatchObject({ ufcFightId: "13002", official: true, status: "final", liveRound: null, liveClock: null });
    expect(s.red).toMatchObject({ ufcFighterId: "3536", knockdowns: 0, sig: [14, 53], takedowns: [0, 0], control: 8 });
    expect(s.blue).toMatchObject({ ufcFighterId: "2642", knockdowns: 1, sig: [37, 50], control: 85 });
    expect(s.red.head[0] + s.red.body[0] + s.red.leg[0]).toBe(s.red.sig[0]);
  });

  test("reads each round, in order", () => {
    const s = parseFightStats(final)!;
    expect(s.rounds.map(r => [r.round, r.red.sig[0], r.blue.sig[0], r.blue.knockdowns])).toEqual([
      [1, 9, 15, 0],
      [2, 5, 22, 1],
    ]);
  });

  test("lines up by fighter id, not list order", () => {
    const p = clone();
    p.LiveFightDetail.FightStats.reverse();
    p.LiveFightDetail.RoundStats.reverse();
    const s = parseFightStats(p)!;
    expect(s.red.sig).toEqual([14, 53]);
    expect(s.rounds[1].blue.knockdowns).toBe(1);
  });

  test("reads the live round and clock only while this fight is in the cage", () => {
    const p = clone();
    Object.assign(p.LiveFightDetail.Event, { LiveFightId: 13002, LiveRoundNumber: 2, LiveRoundElapsedTime: "3:14" });
    Object.assign(p.LiveFightDetail, { Status: "Live", OfficialStats: false });
    expect(parseFightStats(p)).toMatchObject({ status: "live", official: false, liveRound: 2, liveClock: "3:14" });

    p.LiveFightDetail.Event.LiveFightId = 13003;
    expect(parseFightStats(p)).toMatchObject({ liveRound: null, liveClock: null });
  });

  test("has nothing to show before stats exist", () => {
    const p = clone();
    p.LiveFightDetail.FightStats = [];
    p.LiveFightDetail.RoundStats = [];
    expect(parseFightStats(p)).toBeNull();
    delete p.LiveFightDetail.FightStats;
    delete p.LiveFightDetail.RoundStats;
    expect(parseFightStats(p)).toBeNull();
    expect(parseFightStats(null)).toBeNull();
    expect(parseFightStats({ LiveFightDetail: { FightId: 1 } })).toBeNull();
  });

  test("gives up on fighters it can't put in a corner", () => {
    const p = clone();
    p.LiveFightDetail.Fighters[1].Corner = "Red";
    expect(parseFightStats(p)).toBeNull();
  });

  test("a round only one side has yet counts as zero for the other, and junk is zero", () => {
    const p = clone();
    p.LiveFightDetail.RoundStats[1].Rounds.pop();
    p.LiveFightDetail.FightStats[0].SigStrikesLanded = "lots";
    p.LiveFightDetail.FightStats[0].ControlTime = null;
    const s = parseFightStats(p)!;
    expect(s.rounds.map(r => [r.round, r.red.sig[0], r.blue.sig[0], r.blue.ufcFighterId])).toEqual([
      [1, 9, 15, "2642"],
      [2, 5, 0, "2642"],
    ]);
    expect(s.red.sig).toEqual([0, 53]);
    expect(s.red.control).toBe(0);
  });

  test("mid-round gaps: missing fields, numbers as text, seconds as a number", () => {
    const p = clone();
    const red = p.LiveFightDetail.FightStats[0];
    for (const k of Object.keys(red)) if (k !== "FighterId" && k !== "SigStrikesLanded") delete red[k];
    red.SigStrikesLanded = "14";
    p.LiveFightDetail.FightStats[1].ControlTime = 85;
    const s = parseFightStats(p)!;
    expect(s.red).toMatchObject({ sig: [14, 0], total: [0, 0], knockdowns: 0, control: 0 });
    expect(s.blue.control).toBe(85);
  });

  test("adds the totals up from the rounds when the file has rounds only", () => {
    const p = clone();
    delete p.LiveFightDetail.FightStats;
    const s = parseFightStats(p)!;
    expect(s.red).toMatchObject({ ufcFighterId: "3536", sig: [14, 53], knockdowns: 0 });
    expect(s.blue).toMatchObject({ ufcFighterId: "2642", sig: [37, 50], knockdowns: 1 });
  });

  test("totals for one side only: both sides come from the rounds", () => {
    const p = clone();
    p.LiveFightDetail.FightStats.pop();
    p.LiveFightDetail.FightStats[0].SigStrikesLanded = 999;
    const s = parseFightStats(p)!;
    expect(s.red.sig[0]).toBe(14);
    expect(s.blue.sig[0]).toBe(37);
  });
});

test("seconds", () => {
  expect(seconds("4:07")).toBe(247);
  expect(seconds("0:00")).toBe(0);
  expect(seconds("12:30")).toBe(750);
  expect(seconds("4:7")).toBe(0);
  expect(seconds(undefined)).toBe(0);
  expect(seconds(85)).toBe(85);
  expect(seconds(-3)).toBe(0);
});
