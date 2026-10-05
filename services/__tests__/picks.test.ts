import type { LanePick } from "../../components/RoundLane";
import type { EventBout } from "../events";
import { fromPickRow, pickSummary, toPickRow } from "../picks";

const bout: EventBout = {
  id: "b1",
  order: 1,
  segment: "main",
  scheduledRounds: 5,
  weightClass: "Women's Flyweight",
  version: 2,
  locksAt: new Date("2026-10-04T00:00:00Z"),
  red: { id: "silva", name: "Natalia Silva", nickname: null, photoUrl: null, record: null },
  blue: { id: "cong", name: "Wang Cong", nickname: "The Joker", photoUrl: null, record: null },
  odds: null,
  underdog: null,
};

describe("pick rows", () => {
  test.each<[string, LanePick, object]>([
    ["winner only", { corner: "red", finish: "ANY" },
      { picked_fighter_id: "silva", finish: "ANY", finish_round: null, method: null }],
    ["finish, any round", { corner: "blue", finish: "ANY", method: "SUB" },
      { picked_fighter_id: "cong", finish: "ANY", finish_round: null, method: "SUB" }],
    ["round only", { corner: "red", finish: 3 },
      { picked_fighter_id: "silva", finish: "round", finish_round: 3, method: null }],
    ["method and round", { corner: "red", finish: 5, method: "KO" },
      { picked_fighter_id: "silva", finish: "round", finish_round: 5, method: "KO" }],
    ["decision", { corner: "blue", finish: "DEC" },
      { picked_fighter_id: "cong", finish: "DEC", finish_round: null, method: null }],
  ])("%s round-trips", (_, pick, row) => {
    const saved = toPickRow(bout, pick);
    expect(saved).toEqual({ bout_id: "b1", bout_version: 2, ...row });
    expect(fromPickRow(bout, saved)).toEqual(pick);
  });

  test("a decision never carries a method", () => {
    expect(toPickRow(bout, { corner: "red", finish: "DEC", method: "KO" }).method).toBeNull();
  });

  test("a pick made before a substitution has to be made again", () => {
    const saved = toPickRow({ ...bout, version: 1 }, { corner: "red", finish: "ANY" });
    expect(fromPickRow(bout, saved)).toBeNull();
  });

  test("a pick on a fighter no longer in the bout has to be made again", () => {
    expect(fromPickRow(bout, { ...toPickRow(bout, { corner: "red", finish: "ANY" }), picked_fighter_id: "gone" })).toBeNull();
  });
});

describe("pickSummary", () => {
  test.each<[LanePick, string]>([
    [{ corner: "red", finish: "ANY" }, "SILVA"],
    [{ corner: "red", finish: "ANY", method: "KO" }, "SILVA · KO/TKO"],
    [{ corner: "blue", finish: 2, method: "SUB" }, "CONG · SUB · R2"],
    [{ corner: "red", finish: 3 }, "SILVA · R3"],
    [{ corner: "blue", finish: "DEC" }, "CONG · DEC"],
  ])("%j reads %s", (pick, label) => {
    expect(pickSummary(bout, pick)).toBe(label);
  });
});
