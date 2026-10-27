import { AWARDS, dropDate, dropShownUntil, shareText, showsOnLeaguePage, toBadges, toDropInfo, toLeagueDrop, yourLine } from "../awards";
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

describe("how long a drop stays on the league page", () => {
  // Published on a Wednesday afternoon (ET).
  const published = "2026-10-21T18:00:00Z";
  const at = (iso: string) => new Date(iso);

  test("a week after it's published, when the next card locks sooner", () => {
    const drop = toDropInfo({ id: "d1", label: "Check-in", kind: "checkin", ran_at: published, published_at: published, next_lock_at: "2026-10-24T22:00:00Z" });
    expect(dropShownUntil(drop)).toEqual(at("2026-10-28T18:00:00Z"));
    expect(showsOnLeaguePage(drop, at("2026-10-28T17:59:00Z"))).toBe(true);
    expect(showsOnLeaguePage(drop, at("2026-10-28T18:00:00Z"))).toBe(false);
  });

  test("until the next card locks, when that's later than a week", () => {
    const drop = toDropInfo({ id: "d1", label: "Check-in", kind: "checkin", ran_at: published, published_at: published, next_lock_at: "2026-11-07T22:00:00Z" });
    expect(dropShownUntil(drop)).toEqual(at("2026-11-07T22:00:00Z"));
    expect(showsOnLeaguePage(drop, at("2026-11-01T12:00:00Z"))).toBe(true);
    expect(showsOnLeaguePage(drop, at("2026-11-07T22:00:01Z"))).toBe(false);
  });

  test("a week when no card is scheduled yet", () => {
    const drop = toDropInfo({ id: "d1", label: "Check-in", kind: "checkin", ran_at: published, published_at: published, next_lock_at: null });
    expect(dropShownUntil(drop)).toEqual(at("2026-10-28T18:00:00Z"));
  });

  test("stays up without a publish time", () => {
    const drop = toDropInfo({ id: "d1", label: "Check-in", kind: "checkin", ran_at: published });
    expect(dropShownUntil(drop)).toBeNull();
    expect(showsOnLeaguePage(drop, at("2030-01-01T00:00:00Z"))).toBe(true);
  });

  test("lists by the day it was published, in ET", () => {
    // 1 AM UTC on the 26th is still the 25th in New York.
    const drop = toDropInfo({ id: "d1", label: "UFC 333 Check-in", kind: "checkin", ran_at: "2026-10-25T20:00:00Z", published_at: "2026-10-26T01:00:00Z" });
    expect(dropDate(drop)).toBe("Oct 25");
  });
});
