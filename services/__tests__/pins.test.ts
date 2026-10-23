import { filterPinnable, shareCallText, toPinnableCalls, toPinnedCalls } from "../pins";

test("shapes a pinned call as the call, the fight and its points", () => {
  const [call] = toPinnedCalls([
    {
      bout_id: "b1",
      event_name: "UFC 332: Pereira vs. Ankalaev",
      event_date: "2026-10-18T02:00:00Z",
      red_name: "Alex Pereira",
      blue_name: "Magomed Ankalaev",
      picked_name: "Alex Pereira",
      finish: "round",
      finish_round: 2,
      method: "KO",
      points: 125,
    },
  ]);
  expect(call).toEqual({
    boutId: "b1",
    event: "UFC 332: Pereira vs. Ankalaev",
    date: "Oct 17",
    fight: "PEREIRA vs ANKALAEV",
    call: "PEREIRA · KO/TKO · R2",
    points: "+125",
  });
});

describe("the Pin a call sheet", () => {
  const call = (id: string, points: number, date: string, underdog = false, pinned = false) => ({
    ...toPinnableCalls([
      {
        bout_id: id,
        event_name: "UFC 333: Volkanovski vs. Evloev",
        event_date: date,
        red_name: "Alex Volkanovski",
        blue_name: "Movsar Evloev",
        picked_name: "Alex Volkanovski",
        finish: "ANY",
        finish_round: null,
        method: null,
        points,
        underdog,
        pinned,
      },
    ])[0],
  });
  const calls = [
    call("a", 50, "2026-10-03T02:00:00Z"),
    call("b", 187, "2026-10-10T02:00:00Z", true),
    call("c", 125, "2026-10-17T02:00:00Z", false, true),
  ];

  test("Best puts the biggest scores first", () => {
    expect(filterPinnable(calls, "best").map((c) => c.boutId)).toEqual(["b", "c", "a"]);
  });

  test("Recent puts the newest card first", () => {
    expect(filterPinnable(calls, "recent").map((c) => c.boutId)).toEqual(["c", "b", "a"]);
  });

  test("Underdogs shows only underdogs you backed", () => {
    expect(filterPinnable(calls, "underdogs").map((c) => c.boutId)).toEqual(["b"]);
  });

  test("keeps whether each is pinned", () => {
    expect(calls.find((c) => c.boutId === "c")?.pinned).toBe(true);
  });
});

test("sharing a call says what it was and where", () => {
  expect(shareCallText({ call: "VOLKOV · KO/TKO · R2", points: "+125", event: "UFC Fight Night: Buckley vs. Malott", fight: "VOLKOV vs KUNIEV" }))
    .toBe("My call: VOLKOV · KO/TKO · R2 (+125 pts)\nVOLKOV vs KUNIEV · UFC Fight Night: Buckley vs. Malott\n\nFight Night Fantasy");
});
