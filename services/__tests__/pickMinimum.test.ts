jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { bannerText, dismissUntil, leagueShortfalls, lockIn, minimumBanner, requiredOnCard, type MinimumBout } from "../pickMinimum";

const now = new Date("2026-10-31T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3600_000);

// Main event first: 2 main card (lock in 6h), 2 prelims (lock in 4h), 1
// early prelim (locked an hour ago).
const card: MinimumBout[] = [
  { id: "m1", segment: "main", locksAt: at(6) },
  { id: "m2", segment: "main", locksAt: at(6) },
  { id: "p1", segment: "prelims", locksAt: at(4) },
  { id: "p2", segment: "prelims", locksAt: at(4) },
  { id: "e1", segment: "early_prelims", locksAt: at(-1) },
];
const firstLock = at(-1);
const whole = { name: "Test1", tier: "pro" as const, rule: { scope: "whole_card" as const, topN: null } };
const mainCard = { name: "Chill", tier: "pro" as const, rule: { scope: "main_card" as const, topN: null } };

describe("leagueShortfalls", () => {
  test("counts each league's required fights, picked, missed and still open", () => {
    const [w, m] = leagueShortfalls([whole, mainCard], card, (id) => id === "m1", now);
    expect(w).toMatchObject({ league: "Test1", required: 5, picked: 1, missed: 1, left: 3 });
    expect(w.next?.id).toBe("p1");
    expect(m).toMatchObject({ league: "Chill", required: 2, picked: 1, missed: 0, left: 1 });
    expect(m.next?.id).toBe("m2");
  });
});

test("top N counts positions at the lock, void fights included, as the server does", () => {
  const changed = card.map((b) => (b.id === "m2" ? { ...b, changedAfterLock: true } : b));
  const top3 = { scope: "top_n" as const, topN: 3 };
  expect(requiredOnCard("pro", changed, top3).map((b) => b.id)).toEqual(["m1", "p1"]);
  // A void main event hands it to the next fight still standing.
  const voidMain = card.map((b) => (b.id === "m1" ? { ...b, changedAfterLock: true } : b));
  expect(requiredOnCard("pro", voidMain, { scope: "main_event", topN: null }).map((b) => b.id)).toEqual(["m2"]);
});

describe("minimumBanner", () => {
  const short = (picked: string[]) =>
    leagueShortfalls([mainCard], card, (id) => picked.includes(id), now);

  test("a missed minimum shows, dismissed or not", () => {
    const s = leagueShortfalls([whole], card, () => false, now);
    expect(minimumBanner(s, firstLock, now, now.getTime() + 3600_000)).toEqual({ kind: "missed", league: "Test1" });
  });

  test("short: the league needing the most, with its next lock", () => {
    const s = leagueShortfalls([mainCard, { ...mainCard, name: "Other", rule: { scope: "top_n", topN: 4 } }], card, () => false, at(-2));
    const b = minimumBanner(s, at(5), at(-2), null);
    expect(b).toMatchObject({ kind: "short", league: "Other", required: 4, picked: 0 });
  });

  test("✕ goes by the soonest lock across short leagues, not just the worst one", () => {
    const top3 = { name: "Top3", tier: "pro" as const, rule: { scope: "top_n" as const, topN: 3 } };
    const s = leagueShortfalls([mainCard, top3], card.slice(0, 4), (id) => id !== "p1" && id !== "m1" && id !== "m2", at(-2));
    const b = minimumBanner(s, at(5), at(-2), null);
    expect(b?.kind === "short" && b.soonest.getTime()).toBe(at(4).getTime());
  });

  test("only from a day before the first lock", () => {
    const later = at(30);
    expect(minimumBanner(short([]), later, now, null)).toBeNull();
    expect(minimumBanner(short([]), at(23), now, null)).not.toBeNull();
  });

  test("gone once every minimum is met", () => {
    expect(minimumBanner(short(["m1", "m2"]), firstLock, now, null)).toBeNull();
  });

  test("hidden while dismissed, back once that time passes", () => {
    expect(minimumBanner(short([]), firstLock, now, at(1).getTime())).toBeNull();
    expect(minimumBanner(short([]), firstLock, now, at(-0.1).getTime())).not.toBeNull();
  });
});

test("✕ hides it until an hour before the lock, or the lock inside the hour", () => {
  expect(dismissUntil(at(6), now)).toBe(at(5).getTime());
  expect(dismissUntil(at(0.5), now)).toBe(at(0.5).getTime());
});

test("lockIn reads like a countdown", () => {
  expect(lockIn(new Date(now.getTime() + (3 * 60 + 12) * 60_000), now)).toBe("3h 12m");
  expect(lockIn(new Date(now.getTime() + 45 * 60_000), now)).toBe("45m");
  expect(lockIn(at(52), now)).toBe("2d 4h");
});

describe("bannerText", () => {
  test("short, naming the section that locks next", () => {
    expect(
      bannerText({ kind: "short", league: "Test1", required: 12, picked: 5, next: { id: "p1", segment: "prelims", locksAt: at(3) }, soonest: at(3) }, now)
    ).toEqual({
      title: "Test1 needs 12 picks · you've made 5",
      body: "Prelims lock in 3h. Miss one and you forfeit this week's matchup.",
    });
    expect(
      bannerText({ kind: "short", league: "Test1", required: 2, picked: 0, next: { id: "m1", segment: "main", locksAt: at(1) }, soonest: at(1) }, now).body
    ).toBe("Main card locks in 1h. Miss one and you forfeit this week's matchup.");
  });

  test("missed", () => {
    expect(bannerText({ kind: "missed", league: "Test1" }, now).title).toBe("Missed Test1's minimum · this week is a forfeit");
  });
});
