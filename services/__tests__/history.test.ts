import { buildHistory, pickLabel, type HistoryPickRow, type HistoryScoreRow } from "../history";

const NOW = new Date("2026-10-04T06:00:00Z");
const red = { id: "f-red", name: "Natalia Silva" };
const blue = { id: "f-blue", name: "Manon Fiorot" };

function event(id: string, startsAt: string, overrides: Partial<HistoryPickRow["bout"]["event"]> = {}) {
  return { id, name: `UFC ${id}: Silva vs. Wang`, starts_at: startsAt, locks_at: startsAt, status: "complete", season_id: null, ...overrides };
}
function row(boutId: string, order: number, ev: HistoryPickRow["bout"]["event"], overrides: {
  pick?: Partial<HistoryPickRow>;
  bout?: Partial<HistoryPickRow["bout"]>;
} = {}): HistoryPickRow {
  return {
    bout_id: boutId,
    bout_version: 1,
    picked_fighter_id: red.id,
    finish: "round",
    finish_round: 2,
    method: "KO",
    ...overrides.pick,
    bout: {
      id: boutId,
      fight_order: order,
      version: 1,
      status: "scheduled",
      red,
      blue,
      event: ev,
      result: { status: "final", winner_fighter_id: red.id, method: "KO", round: 2, time: "3:41", void_reason: null },
      ...overrides.bout,
    },
  };
}
const score = (boutId: string, points: number, overrides: Partial<HistoryScoreRow> = {}): HistoryScoreRow => ({
  bout_id: boutId,
  points,
  correct: points > 0,
  counts_for_accuracy: true,
  provisional: false,
  ...overrides,
});

describe("pickLabel", () => {
  test.each([
    [{ finish: "round", finish_round: 2, method: "KO" }, "SILVA · KO/TKO · R2"],
    [{ finish: "round", finish_round: 3, method: null }, "SILVA · R3"],
    [{ finish: "ANY", finish_round: null, method: "SUB" }, "SILVA · SUB"],
    [{ finish: "ANY", finish_round: null, method: null }, "SILVA"],
    [{ finish: "DEC", finish_round: null, method: null }, "SILVA · DEC"],
  ] as const)("%j reads %s", (pick, label) => {
    expect(pickLabel(pick, "Natalia Silva")).toBe(label);
  });
});

describe("buildHistory", () => {
  const ufc332 = event("332", "2026-10-04T00:00:00Z");

  test("shapes a scored bout with result, pick, points and a hit", () => {
    const h = buildHistory([row("b1", 1, ufc332)], [score("b1", 125)], null, NOW);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ id: "332", date: "3 Oct", points: 125, hit: 1, total: 1, picked: 1, live: false, provisional: false });
    expect(h.events[0].bouts[0]).toEqual({
      id: "b1",
      red: { initials: "NS", name: "Natalia Silva", method: "KO/TKO" },
      blue: { initials: "MF", name: "Manon Fiorot" },
      settled: true,
      meta: "Final",
      detail: "R2, 3:41",
      points: "+125",
      verdict: "hit",
      pick: "SILVA · KO/TKO · R2",
    });
  });

  test("marks a wrong pick as a miss with signed points", () => {
    const h = buildHistory([row("b1", 1, ufc332, { pick: { picked_fighter_id: blue.id } })], [score("b1", -50)], null, NOW);
    expect(h.events[0].bouts[0]).toMatchObject({ verdict: "miss", points: "−50", pick: "FIOROT · KO/TKO · R2" });
    expect(h.events[0]).toMatchObject({ points: -50, hit: 0, total: 1 });
  });

  test("leaves a bout without a result pending and unsettled", () => {
    const h = buildHistory([row("b1", 1, ufc332, { bout: { result: null } })], [], null, NOW);
    expect(h.events[0].bouts[0]).toMatchObject({ verdict: "pending", settled: false, meta: "Pending" });
    expect(h.events[0].bouts[0].points).toBeUndefined();
  });

  test("accepts the result as a one-item list", () => {
    const result = { status: "provisional" as const, winner_fighter_id: red.id, method: "DEC" as const, round: null, time: "5:00", void_reason: null };
    const h = buildHistory([row("b1", 1, ufc332, { bout: { result: [result] } })], [score("b1", 50, { provisional: true })], null, NOW);
    expect(h.events[0].bouts[0]).toMatchObject({ meta: "Provisional", red: { method: "DEC" } });
    expect(h.events[0].bouts[0].detail).toBeUndefined();
    expect(h.events[0].provisional).toBe(true);
  });

  test("explains voids", () => {
    const nc = { status: "final" as const, winner_fighter_id: null, method: null, round: null, time: "0:15", void_reason: "NC" as const };
    const h = buildHistory(
      [
        row("b1", 1, ufc332, { bout: { result: nc } }),
        row("b2", 2, ufc332, { bout: { status: "cancelled", result: null } }),
        row("b3", 3, ufc332, { pick: { bout_version: 1 }, bout: { version: 2 } }),
      ],
      [score("b1", 0, { counts_for_accuracy: false }), score("b2", 0, { counts_for_accuracy: false }), score("b3", 0, { counts_for_accuracy: false })],
      null,
      NOW
    );
    expect(h.events[0].bouts.map(b => [b.meta, b.verdict, b.voidNote, b.red.method])).toEqual([
      ["No contest", "void", "VOID · NO CONTEST", "NC"],
      ["Cancelled", "void", "VOID · BOUT CANCELLED", undefined],
      ["Final", "void", "VOID · OPPONENT CHANGED", "KO/TKO"],
    ]);
    expect(h.events[0]).toMatchObject({ hit: 0, total: 0, points: 0 });
  });

  test("hides cards that have not locked", () => {
    const upcoming = event("333", "2026-10-11T00:00:00Z");
    expect(buildHistory([row("b1", 1, upcoming)], [], null, NOW).events).toEqual([]);
  });

  test("marks a live card with pending bouts as provisional", () => {
    const live = event("332", "2026-10-04T00:00:00Z", { status: "live" });
    const h = buildHistory([row("b1", 1, live), row("b2", 2, live, { bout: { result: null } })], [score("b1", 125)], null, NOW);
    expect(h.events[0]).toMatchObject({ live: true, provisional: true, points: 125 });
  });

  test("orders events newest first and bouts in card order", () => {
    const older = event("331", "2026-09-27T00:00:00Z");
    const h = buildHistory([row("o1", 1, older), row("n2", 2, ufc332), row("n1", 1, ufc332)], [], null, NOW);
    expect(h.events.map(e => e.id)).toEqual(["332", "331"]);
    expect(h.events[0].bouts.map(b => b.id)).toEqual(["n1", "n2"]);
  });

  test("totals pre-season events when no season is open", () => {
    const older = event("331", "2026-09-27T00:00:00Z");
    const h = buildHistory([row("o1", 1, older), row("n1", 1, ufc332)], [score("o1", 125), score("n1", -50)], null, NOW);
    expect(h.season).toEqual({ label: "PRE-SEASON", points: 75, hit: 1, total: 2, events: 2 });
  });

  test("totals only the current season once one is open", () => {
    const preseason = event("331", "2026-09-27T00:00:00Z");
    const inSeason = event("332", "2026-10-04T00:00:00Z", { season_id: "s1" });
    const h = buildHistory([row("o1", 1, preseason), row("n1", 1, inSeason)], [score("o1", 125), score("n1", 50)], { id: "s1", number: 1 }, NOW);
    expect(h.season).toEqual({ label: "SEASON 1", points: 50, hit: 1, total: 1, events: 1 });
    expect(h.events).toHaveLength(2);
  });
});
