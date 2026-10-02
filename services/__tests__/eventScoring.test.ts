import { scoreEvent, type BoutRow, type PickRow, type ResultRow } from "../eventScoring";

const bout = (overrides: Partial<BoutRow> = {}): BoutRow => ({
  id: "b1",
  version: 1,
  status: "scheduled",
  red_fighter_id: "red",
  blue_fighter_id: "blue",
  card_segment: "main",
  underdog_corner: null,
  ...overrides,
});
const result = (overrides: Partial<ResultRow> = {}): ResultRow => ({
  bout_id: "b1",
  status: "final",
  winner_fighter_id: "red",
  method: "KO",
  round: 2,
  void_reason: null,
  ...overrides,
});
const pick = (overrides: Partial<PickRow> = {}): PickRow => ({
  user_id: "u1",
  bout_id: "b1",
  bout_version: 1,
  picked_fighter_id: "red",
  finish: "round",
  finish_round: 2,
  method: "KO",
  ...overrides,
});

describe("scoreEvent", () => {
  test("scores a pick against its result", () => {
    expect(scoreEvent([bout()], [result()], [pick()])).toEqual([
      {
        user_id: "u1",
        bout_id: "b1",
        points: 125,
        breakdown: { fighter: 50, method: 50, round: 25, underdogBonus: 0 },
        correct: true,
        counts_for_accuracy: true,
        provisional: false,
      },
    ]);
  });

  test("reads the picked corner from the fighter, so a corner swap changes nothing", () => {
    const swapped = bout({ red_fighter_id: "blue", blue_fighter_id: "red" });
    const [row] = scoreEvent([swapped], [result()], [pick()]);
    expect(row.points).toBe(125);
  });

  test("maps each finish kind", () => {
    const rows = scoreEvent(
      [bout()],
      [result({ method: "DEC", round: null })],
      [
        pick({ user_id: "dec", finish: "DEC", finish_round: null, method: null }),
        pick({ user_id: "any", finish: "ANY", finish_round: null, method: null }),
        pick({ user_id: "round", finish: "round", finish_round: 3, method: null }),
      ]
    );
    expect(Object.fromEntries(rows.map(r => [r.user_id, r.points]))).toEqual({ dec: 100, any: 50, round: 35 });
  });

  test("writes no row while a bout has no result", () => {
    expect(scoreEvent([bout()], [], [pick()])).toEqual([]);
  });

  test("marks scores against a provisional result", () => {
    const [row] = scoreEvent([bout()], [result({ status: "provisional" })], [pick()]);
    expect(row.provisional).toBe(true);
  });

  test("voids picks on a cancelled bout, even with no result", () => {
    const [row] = scoreEvent([bout({ status: "cancelled" })], [], [pick()]);
    expect(row).toMatchObject({ points: 0, counts_for_accuracy: false, provisional: false });
  });

  test("voids a pick made before a fighter was replaced", () => {
    const [stale, fresh] = scoreEvent(
      [bout({ version: 2 })],
      [result()],
      [pick({ user_id: "stale", bout_version: 1 }), pick({ user_id: "fresh", bout_version: 2 })]
    );
    expect(stale).toMatchObject({ points: 0, counts_for_accuracy: false });
    expect(fresh.points).toBe(125);
  });

  test("voids every pick on a No Contest", () => {
    const [row] = scoreEvent([bout()], [result({ winner_fighter_id: null, method: null, round: null, void_reason: "NC" })], [pick()]);
    expect(row).toMatchObject({ points: 0, counts_for_accuracy: false });
  });

  test("applies the main-card underdog bonus from the bout", () => {
    const [main] = scoreEvent([bout({ underdog_corner: "red" })], [result()], [pick()]);
    expect(main.points).toBe(187);
    const [prelim] = scoreEvent([bout({ underdog_corner: "red", card_segment: "prelims" })], [result()], [pick()]);
    expect(prelim.points).toBe(125);
  });

  test("plays full deductions for global scores", () => {
    const [row] = scoreEvent([bout()], [result()], [pick({ picked_fighter_id: "blue", finish_round: 3, method: "SUB" })]);
    expect(row.points).toBe(-95);
  });

  test("ignores picks on bouts outside the card", () => {
    expect(scoreEvent([bout()], [result()], [pick({ bout_id: "elsewhere" })])).toEqual([]);
  });
});
