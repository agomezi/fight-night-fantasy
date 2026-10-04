import { boutLocked, countdown, initials, lastName, lockLabel, nextLock, splitEventName, startLabel, toNextEvent } from "../events";

const fighter = (id: string, name: string) => ({ id, name, nickname: null, photoUrl: null });
const bout = (id: string, order: number, status: "scheduled" | "cancelled" = "scheduled", locks_at: string | null = null) => ({
  id,
  fight_order: order,
  card_segment: "main" as const,
  scheduled_rounds: 3,
  weight_class: "Lightweight",
  version: 1,
  status,
  locks_at,
  red: fighter(`${id}r`, "Red"),
  blue: fighter(`${id}b`, "Blue"),
});

describe("toNextEvent", () => {
  test("keeps scheduled bouts only, main event first", () => {
    const event = toNextEvent({
      id: "e",
      name: "UFC 332: Silva vs. Wang",
      starts_at: "2026-10-03T20:00:00+00:00",
      locks_at: "2026-10-03T20:00:00+00:00",
      status: "scheduled",
      bouts: [bout("c", 3), bout("x", 2, "cancelled"), bout("a", 1)],
    });
    expect(event.bouts.map((b) => b.id)).toEqual(["a", "c"]);
    expect(event.locksAt.toISOString()).toBe("2026-10-03T20:00:00.000Z");
  });

  test("each bout keeps its own lock, or the card's when it has none", () => {
    const event = toNextEvent({
      id: "e",
      name: "UFC 332: Silva vs. Wang",
      starts_at: "2026-10-03T20:00:00+00:00",
      locks_at: "2026-10-03T20:00:00+00:00",
      status: "scheduled",
      bouts: [bout("a", 1, "scheduled", "2026-10-04T00:00:00+00:00"), bout("b", 2)],
    });
    expect(event.bouts.map((b) => b.locksAt.toISOString())).toEqual(["2026-10-04T00:00:00.000Z", "2026-10-03T20:00:00.000Z"]);
  });
});

describe("section locks", () => {
  const at = (iso: string) => ({ locksAt: new Date(iso) });
  const card = [at("2026-10-04T00:00:00Z"), at("2026-10-03T22:00:00Z"), at("2026-10-03T20:00:00Z")];
  const now = new Date("2026-10-03T21:00:00Z");

  test("a bout is locked once its section has started", () => {
    expect(card.map((b) => boutLocked(b, now))).toEqual([false, false, true]);
  });

  test("the next lock is the soonest section still open", () => {
    expect(nextLock(card, now)?.toISOString()).toBe("2026-10-03T22:00:00.000Z");
  });

  test("there is no next lock once the whole card has locked", () => {
    expect(nextLock(card, new Date("2026-10-04T01:00:00Z"))).toBeNull();
  });
});

describe("names", () => {
  test.each([
    ["UFC 332: Silva vs. Wang", "UFC 332", "Silva vs. Wang"],
    ["UFC Fight Night: Allen vs. Duncan", "UFC Fight Night", "Allen vs. Duncan"],
    ["UFC Freedom 250", "UFC Freedom 250", null],
  ])("%s splits into title and headline", (name, title, headline) => {
    expect(splitEventName(name)).toEqual({ title, headline });
  });
  test.each([
    ["Natalia Silva", "Silva"],
    ["Wang Cong", "Cong"],
    ["Raul Rosas Jr.", "Rosas Jr."],
    ["Mizuki", "Mizuki"],
  ])("%s is billed as %s", (name, billed) => expect(lastName(name)).toBe(billed));
  test("initials", () => {
    expect(initials("Natalia Silva")).toBe("NS");
    expect(initials("Mizuki")).toBe("M");
  });
});

describe("time", () => {
  const now = new Date("2026-10-01T05:30:00Z");
  test("countdown in days, hours and minutes", () => {
    expect(countdown(new Date("2026-10-03T20:00:00Z"), now)).toEqual({ days: 2, hours: 14, minutes: 30 });
    expect(countdown(new Date("2026-09-30T00:00:00Z"), now)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
  test.each([
    ["2026-10-03T20:00:00Z", "2D 14H"],
    ["2026-10-01T19:31:00Z", "14H"],
    ["2026-10-01T06:15:00Z", "45M"],
    ["2026-10-01T05:30:20Z", "1M"],
    ["2026-10-01T05:30:00Z", "LOCKED"],
  ])("locking at %s reads %s", (at, label) => expect(lockLabel(new Date(at), now)).toBe(label));
  test("start time is shown in Eastern", () => {
    expect(startLabel(new Date("2026-10-03T20:00:00Z"))).toBe("SAT · 4PM ET");
    expect(startLabel(new Date("2026-10-04T00:30:00Z"))).toBe("SAT · 8:30PM ET");
  });
});
