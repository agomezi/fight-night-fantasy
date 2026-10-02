import { parseResults } from "../results";

// Hand-built payloads in the live-stats feed's shape, trimmed to the fields the
// parser reads. Method prose, outcomes and statuses are values seen on real
// cards, including the draw and No Contest shapes.
type Overrides = Record<string, unknown>;
function fighter(id: number, outcome: string | null) {
  return { FighterId: id, Outcome: outcome ? { OutcomeId: 1, Outcome: outcome } : null };
}
function fight(id: number, status: string, result: Overrides | null, outcomes: [string | null, string | null] = [null, null]) {
  return {
    FightId: id,
    Status: status,
    Fighters: [fighter(id * 10 + 1, outcomes[0]), fighter(id * 10 + 2, outcomes[1])],
    Result: result ?? { Method: null, EndingRound: null, EndingTime: null },
  };
}
function payload(fights: unknown[], overrides: Overrides = {}) {
  return { LiveEventDetail: { EventId: 1338, Status: "Live", LiveFightId: null, FightCard: fights, ...overrides } };
}
const only = (f: unknown) => parseResults(payload([f])).bouts[0];

describe("parseResults", () => {
  test("reads event status and the bout in the cage", () => {
    const card = parseResults(payload([fight(1, "Live", null)], { LiveFightId: 1 }));
    expect(card).toMatchObject({ ufcEventId: "1338", status: "live", liveFightId: "1" });
    expect(card.bouts[0]).toEqual({ ufcFightId: "1", status: "live", result: null });
  });

  test("maps Over and Final to complete, Upcoming to scheduled", () => {
    expect(parseResults(payload([], { Status: "Final" })).status).toBe("complete");
    expect(parseResults(payload([], { Status: "Over" })).status).toBe("complete");
    expect(parseResults(payload([], { Status: "Upcoming" })).status).toBe("scheduled");
  });

  test("reads a finish with winner, round and time", () => {
    const b = only(fight(2, "Final", { Method: "KO/TKO", EndingRound: 1, EndingTime: "4:55" }, ["Loss", "Win"]));
    expect(b.result).toMatchObject({ final: true, winnerUfcFighterId: "22", method: "KO", round: 1, time: "4:55", voidReason: null });
  });

  test("uses the result before the bout reads Final, as provisional", () => {
    // Seen live: the method was set while the bout still read "Live", ten
    // minutes before "Final".
    const live = only(fight(3, "Live", { Method: "Submission", EndingRound: 3, EndingTime: "4:46" }, ["Win", "Loss"]));
    expect(live.result).toMatchObject({ final: false, method: "SUB", round: 3 });
    const over = only(fight(3, "Over", { Method: "Submission", EndingRound: 2, EndingTime: "4:46" }, ["Win", "Loss"]));
    expect(over.result).toMatchObject({ final: false, round: 2 });
  });

  test("drops the round on a decision", () => {
    const b = only(fight(4, "Final", { Method: "Decision - Split", EndingRound: 3, EndingTime: "5:00" }, ["Win", "Loss"]));
    expect(b.result).toMatchObject({ method: "DEC", round: null, winnerUfcFighterId: "41" });
  });

  test("reads a draw from the outcomes, not the decision method", () => {
    const b = only(fight(5, "Final", { Method: "Decision - Unanimous", EndingRound: 3, EndingTime: "5:00" }, ["Draw", "Draw"]));
    expect(b.result).toMatchObject({ voidReason: "DRAW", winnerUfcFighterId: null, method: null, round: null });
  });

  test("reads Could Not Continue as a No Contest", () => {
    const b = only(fight(6, "Final", { Method: "Could Not Continue", EndingRound: 1, EndingTime: "0:15" }, ["No Contest", "No Contest"]));
    expect(b.result).toMatchObject({ voidReason: "NC", round: null, time: "0:15" });
  });

  test("applies the doctor's stoppage ruling", () => {
    const b = only(fight(7, "Final", { Method: "TKO - Doctor's Stoppage", EndingRound: 2, EndingTime: "5:00" }, ["Win", "Loss"]));
    expect(b.result).toMatchObject({ method: "KO", round: 2 });
  });

  test("keeps the feed's fields as raw", () => {
    const b = only(fight(8, "Over", { Method: "KO/TKO", EndingRound: 1, EndingTime: "1:02" }, ["Win", "Loss"]));
    expect(b.result!.raw).toEqual({
      status: "Over",
      method: "KO/TKO",
      endingRound: 1,
      endingTime: "1:02",
      outcomes: [{ fighterId: "81", outcome: "Win" }, { fighterId: "82", outcome: "Loss" }],
    });
  });

  describe("holds a result it cannot trust", () => {
    test("unknown method", () => {
      const b = only(fight(9, "Final", { Method: "Referee Confusion", EndingRound: 1, EndingTime: "1:00" }, ["Win", "Loss"]));
      expect(b.result).toBeNull();
      expect(b.issues).toEqual(["Unrecognized method: Referee Confusion"]);
    });

    test("no unique winner", () => {
      const b = only(fight(10, "Final", { Method: "KO/TKO", EndingRound: 1, EndingTime: "1:00" }, [null, null]));
      expect(b.result).toBeNull();
      expect(b.issues).toEqual(["Result has no unique winner"]);
    });

    test("finish with no round", () => {
      const b = only(fight(11, "Final", { Method: "Submission", EndingRound: null, EndingTime: "1:00" }, ["Win", "Loss"]));
      expect(b.result).toBeNull();
      expect(b.issues).toEqual(["Finish has no valid round"]);
    });

    test("winner with no method yet", () => {
      const b = only(fight(12, "Live", null, ["Win", "Loss"]));
      expect(b.result).toBeNull();
      expect(b.issues).toEqual(["Winner present but method is missing"]);
    });
  });

  test("nulls a malformed time without dropping the result", () => {
    const b = only(fight(13, "Final", { Method: "KO/TKO", EndingRound: 1, EndingTime: "soon" }, ["Win", "Loss"]));
    expect(b.result).toMatchObject({ method: "KO", time: null });
  });

  test("fails loudly on missing structure", () => {
    expect(() => parseResults({ LiveEventDetail: { Status: "Live", FightCard: [] } })).toThrow("Missing event id");
    expect(() => parseResults(payload([fight(1, "Live", null)], { Status: "Paused" }))).toThrow("Unknown status");
    expect(() => parseResults(payload([{ ...fight(1, "Live", null), Fighters: [] }]))).toThrow("two fighters");
    expect(() => parseResults(payload([fight(1, "Live", null), fight(1, "Live", null)]))).toThrow("Duplicate fight ids");
  });

  test("is deterministic", () => {
    const p = payload([fight(2, "Final", { Method: "KO/TKO", EndingRound: 1, EndingTime: "4:55" }, ["Loss", "Win"])]);
    expect(parseResults(p)).toEqual(parseResults(JSON.parse(JSON.stringify(p))));
  });
});
