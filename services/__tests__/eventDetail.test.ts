import { buildEventDetail, type EventRow, type MyPick, type MyScore } from "../eventDetail";

const NOW = new Date("2026-10-11T01:00:00Z");
const f = (id: string, name: string) => ({ id, name, photoUrl: null });
type Bout = EventRow["bouts"][number];
const bout = (id: string, order: number, segment: Bout["card_segment"], locks: string, extra: Partial<Bout> = {}): Bout => ({
  id,
  fight_order: order,
  card_segment: segment,
  scheduled_rounds: order === 1 ? 5 : 3,
  weight_class: "Lightweight",
  version: 1,
  status: "scheduled",
  locks_at: locks,
  red: f(`${id}r`, "Arnold Allen"),
  blue: f(`${id}b`, "Jack Duncan"),
  result: null,
  ...extra,
});

const MAIN = "2026-10-11T00:00:00Z";
const PRELIMS = "2026-10-10T22:00:00Z";
const EARLY = "2026-10-10T21:00:00Z";

const row = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: "e1",
  name: "UFC Fight Night: Allen vs. Duncan",
  starts_at: EARLY,
  locks_at: EARLY,
  status: "live",
  live_bout_id: "b2",
  bouts: [
    bout("b3", 3, "prelims", PRELIMS, {
      result: { status: "final", winner_fighter_id: "b3b", method: "DEC", round: null, time: "5:00", void_reason: null },
    }),
    bout("b1", 1, "main", MAIN),
    bout("b2", 2, "main", MAIN),
    bout("b4", 4, "early_prelims", EARLY, {
      result: { status: "provisional", winner_fighter_id: "b4r", method: "KO", round: 2, time: "3:41", void_reason: null },
    }),
    bout("b5", 5, "early_prelims", EARLY, { status: "cancelled" }),
  ],
  ...overrides,
});

const pick = (bout_id: string, picked: string, extra: Partial<MyPick> = {}): MyPick => ({
  bout_id,
  bout_version: 1,
  picked_fighter_id: picked,
  finish: "ANY",
  finish_round: null,
  method: null,
  ...extra,
});
const score = (bout_id: string, points: number, extra: Partial<MyScore> = {}): MyScore => ({
  bout_id,
  points,
  correct: points > 0,
  counts_for_accuracy: true,
  provisional: false,
  ...extra,
});

describe("buildEventDetail", () => {
  const detail = buildEventDetail(
    row(),
    [pick("b3", "b3r", { finish: "DEC" }), pick("b4", "b4r", { finish: "round", finish_round: 2, method: "KO" }), pick("b1", "b1r")],
    [score("b3", -25), score("b4", 125, { provisional: true })],
    NOW
  );

  test("splits the name and reads the status", () => {
    expect(detail).toMatchObject({ title: "UFC Fight Night", headline: "Allen vs. Duncan", status: "live" });
  });

  test("groups bouts into sections in card order, main card first", () => {
    expect(detail.sections.map((s) => [s.label, s.bouts.map((b) => b.order)])).toEqual([
      ["MAIN CARD", [1, 2]],
      ["PRELIMS", [3]],
      ["EARLY PRELIMS", [4, 5]],
    ]);
  });

  test("marks which sections have locked", () => {
    expect(detail.sections.map((s) => s.locked)).toEqual([true, true, true]);
    const earlier = buildEventDetail(row(), [], [], new Date("2026-10-10T21:30:00Z"));
    expect(earlier.sections.map((s) => s.locked)).toEqual([false, false, true]);
  });

  test("shows each bout's state and result", () => {
    const lines = detail.sections.flatMap((s) => s.bouts);
    expect(lines.map((b) => [b.order, b.state, b.result])).toEqual([
      [1, "pending", null],
      [2, "live", null],
      [3, "final", "Decision"],
      [4, "provisional", "KO/TKO · R2 3:41"],
      [5, "cancelled", "Cancelled"],
    ]);
  });

  test("marks the winner", () => {
    const b4 = detail.sections[2].bouts[0];
    expect([b4.red.won, b4.blue.won]).toEqual([true, false]);
    expect(b4.red.initials).toBe("AA");
  });

  test("shows your pick, verdict and points", () => {
    const lines = detail.sections.flatMap((s) => s.bouts);
    expect(lines.map((b) => [b.order, b.pick, b.verdict, b.points])).toEqual([
      [1, "ALLEN", "pending", null],
      [2, null, null, null],
      [3, "ALLEN · DEC", "miss", "−25"],
      [4, "ALLEN · KO/TKO · R2", "hit", "+125"],
      [5, null, null, null],
    ]);
  });

  test("totals your card and flags it provisional", () => {
    expect(detail).toMatchObject({ points: 100, hit: 1, total: 2, picked: 3, provisional: true });
  });

  test("an upcoming card has nothing pending", () => {
    const upcoming = buildEventDetail(row({ status: "scheduled", live_bout_id: null }), [], [], new Date("2026-10-09T00:00:00Z"));
    expect(upcoming.status).toBe("upcoming");
    expect(upcoming.sections[0].bouts.map((b) => b.state)).toEqual(["upcoming", "upcoming"]);
  });

  test("a finished card reads final", () => {
    expect(buildEventDetail(row({ status: "complete", live_bout_id: null }), [], [], NOW).status).toBe("final");
  });
});
