import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { parseFightStats, seconds } from "../fightStats";

// A finished fight in the per-fight file's shape, with made-up ids and only
// the fields the parser reads: red stopped by blue's knockdown in round 2.
const final = require("../__fixtures__/live-stats/fight-final.json");

// Real per-fight files saved during cards stay on the machine (gitignored);
// when there are some, every one must parse and add up.
const realDir = join(__dirname, "../__fixtures__/live-stats/real");
const realFiles = existsSync(realDir) ? readdirSync(realDir).filter(f => f.endsWith(".json")) : [];
const clone = () => JSON.parse(JSON.stringify(final));

describe("parseFightStats", () => {
  test("reads totals per corner from a finished fight", () => {
    const s = parseFightStats(final)!;
    expect(s).toMatchObject({ ufcFightId: "90001", official: true, status: "final", liveRound: null, liveClock: null });
    expect(s.red).toMatchObject({ ufcFighterId: "91001", knockdowns: 0, sig: [14, 53], takedowns: [0, 0], control: 8 });
    expect(s.blue).toMatchObject({ ufcFighterId: "91002", knockdowns: 1, sig: [37, 50], control: 85 });
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
    Object.assign(p.LiveFightDetail.Event, { LiveFightId: 90001, LiveRoundNumber: 2, LiveRoundElapsedTime: "3:14" });
    Object.assign(p.LiveFightDetail, { Status: "Live", OfficialStats: false });
    expect(parseFightStats(p)).toMatchObject({ status: "live", official: false, liveRound: 2, liveClock: "3:14" });

    p.LiveFightDetail.Event.LiveFightId = 90002;
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
      [1, 9, 15, "91002"],
      [2, 5, 0, "91002"],
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
    expect(s.red).toMatchObject({ ufcFighterId: "91001", sig: [14, 53], knockdowns: 0 });
    expect(s.blue).toMatchObject({ ufcFighterId: "91002", sig: [37, 50], knockdowns: 1 });
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

(realFiles.length ? describe : describe.skip)("saved real files", () => {
  test.each(realFiles.length ? realFiles : ["none"])("%s parses and adds up", (file) => {
    const s = parseFightStats(JSON.parse(readFileSync(join(realDir, file), "utf8")));
    expect(s).not.toBeNull();
    expect(s!.red.ufcFighterId).not.toBe(s!.blue.ufcFighterId);
    for (const corner of ["red", "blue"] as const) {
      const t = s![corner];
      expect(t.head[0] + t.body[0] + t.leg[0]).toBe(t.sig[0]);
      // Finished fights only: mid-round files can run a round ahead of the totals.
      if (s!.status === "final" && s!.rounds.length) {
        expect(s!.rounds.reduce((n, r) => n + r[corner].sig[0], 0)).toBe(t.sig[0]);
      }
    }
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
