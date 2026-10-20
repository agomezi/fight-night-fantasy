import { toPinnedCalls } from "../pins";

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
