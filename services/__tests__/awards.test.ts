import { AWARDS, shareText, toBadges, toLeagueDrop, yourLine } from "../awards";
import { notificationText } from "../notificationText";

const raw = {
  drop: { id: "d1", label: "Pre-season check-in", kind: "checkin" as const },
  awards: [
    { award: "gun_shy" as const, userId: "u4", name: "Joel", value: 4 },
    { award: "dog" as const, userId: "u2", name: "Soggy", value: 4 },
    { award: "interim_champ" as const, userId: "u1", name: "Ayden", value: null },
    { award: "finisher" as const, userId: "u4", name: "Joel", value: 1 },
  ],
  p4p: { userId: "u2", name: "Soggy", edge: 212 },
  table: [
    { userId: "u1", name: "Ayden", rank: 1, wins: 2, losses: 1, draws: 0, points: -156, projected: { wins: 7, losses: 4, draws: 0, points: -570 } },
  ],
  me: { places: { dog: 2, sniper: 1, gun_shy: 1 } },
};

describe("a league's award drop", () => {
  const drop = toLeagueDrop(raw)!;

  test("leads with the champion and ends with the joke", () => {
    expect(drop.awards.map((a) => a.award)).toEqual(["interim_champ", "finisher", "dog", "gun_shy"]);
  });

  test("reads each award's stat", () => {
    expect(AWARDS.finisher.stat(1)).toBe("100% finish calls");
    expect(AWARDS.dog.stat(4)).toBe("4 underdog wins");
    expect(AWARDS.p4p.stat(212)).toBe("+212 edge");
  });

  test("says what you won, or your best placing, never the joke", () => {
    expect(yourLine(drop, "u2")).toBe("You won Upset Artist.");
    expect(yourLine(drop, "u9")).toBe("Your best: 1st in Round Sniper.");
    expect(yourLine({ ...drop, myPlaces: {} }, "u9")).toBe("Pick a few more fights to get into the running.");
  });

  test("shares as text", () => {
    expect(shareText("Test1", drop)).toContain("Interim Champ: Ayden");
    expect(shareText("Test1", drop)).toContain("Upset Artist: Soggy (4 underdog wins)");
  });

  test("has no drop before one is published", () => {
    expect(toLeagueDrop(null)).toBeNull();
  });
});

test("badges, newest season first, in award order", () => {
  const badges = toBadges([
    { award: "dog", season: 1, scope: "Test1", value: 4 },
    { award: "gun_shy", season: 2, scope: "Test1", value: 1.5 },
    { award: "champ", season: 2, scope: "Test1", value: null },
    { award: "retired_award", season: 2, scope: "Global", value: null },
  ]);
  expect(badges.map((b) => `${b.season}:${b.title}:${b.scope}`)).toEqual([
    "S2:Champ:Test1",
    "S2:Ring Rust:Test1",
    "S1:Upset Artist:Test1",
  ]);
  expect(badges[1].joke).toBe(true);
});

test("the awards push opens Leagues", () => {
  const m = notificationText("awards", { label: "Pre-season check-in", kind: "checkin", dropId: "d1" });
  expect(m.title).toBe("Pre-season check-in: the awards are in");
  expect(m.data).toEqual({ screen: "leagues" });
});
