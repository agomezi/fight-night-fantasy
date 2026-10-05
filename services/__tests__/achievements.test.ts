import { achievementsFor, recentPicks } from "../achievements";
import type { History, HistoryBout, HistoryEvent } from "../history";

const bout = (id: string, verdict: HistoryBout["verdict"], points?: string): HistoryBout => ({
  id,
  red: { initials: "AA", name: "A. Red" },
  blue: { initials: "BB", name: "B. Blue" },
  settled: verdict !== "pending",
  meta: "Final",
  points,
  verdict,
  pick: "RED · KO",
});

const event = (id: string, bouts: HistoryBout[], extra: Partial<HistoryEvent> = {}): HistoryEvent => {
  const counted = bouts.filter((b) => b.verdict === "hit" || b.verdict === "miss");
  return {
    id,
    name: `Card ${id}`,
    date: "3 Oct",
    live: false,
    provisional: false,
    points: 0,
    hit: counted.filter((b) => b.verdict === "hit").length,
    total: counted.length,
    picked: bouts.length,
    bouts,
    ...extra,
  };
};

const history = (events: HistoryEvent[]): History => ({
  season: { label: "PRE-SEASON", points: 0, hit: 0, total: 0, events: events.length },
  events,
});

const earned = (h: History | null) => achievementsFor(h).filter((a) => a.earned).map((a) => a.id);

describe("achievementsFor", () => {
  test("a new account has everything locked", () => {
    expect(earned(null)).toEqual([]);
    expect(achievementsFor(null).find((a) => a.id === "streak")?.sub).toBe("10 correct picks in a row · best 0");
  });

  test("a winner, and a winner with the method, earn First Blood and Bullseye", () => {
    expect(earned(history([event("1", [bout("a", "hit", "+50")])]))).toEqual(["first-blood"]);
    expect(earned(history([event("1", [bout("a", "hit", "+125")])]))).toEqual(["first-blood", "bullseye"]);
  });

  test("Regular counts finished cards you picked on", () => {
    const three = history([1, 2, 3].map((n) => event(String(n), [bout(`b${n}`, "miss", "−50")])));
    expect(earned(three)).toEqual(["regular"]);
    const live = history([event("1", [bout("a", "miss")], { live: true })]);
    expect(achievementsFor(live).find((a) => a.id === "regular")?.sub).toBe("Play 3 cards · 0/3");
  });

  test("the streak runs in fight order across cards, and a miss resets it", () => {
    // Newest card first; within a card the main event (fought last) is first.
    const older = event("1", [bout("o1", "hit"), bout("o2", "miss")]);
    const newer = event("2", Array.from({ length: 9 }, (_, i) => bout(`n${i}`, "hit")));
    // Fought order: o2 miss, o1 hit, then nine hits → a run of 10.
    expect(earned(history([newer, older]))).toContain("streak");
    const broken = event("2", [...Array.from({ length: 8 }, (_, i) => bout(`n${i}`, "hit")), bout("m", "miss")]);
    // Fought order: o2 miss, o1 hit, then m miss on the newer card and eight hits → best 8.
    expect(achievementsFor(history([broken, older])).find((a) => a.id === "streak")?.sub).toBe(
      "10 correct picks in a row · best 8"
    );
  });

  test("a perfect card needs five picks, all right, and final", () => {
    const five = Array.from({ length: 5 }, (_, i) => bout(`p${i}`, "hit"));
    expect(earned(history([event("1", five)]))).toContain("perfect");
    expect(earned(history([event("1", five.slice(0, 4))]))).not.toContain("perfect");
    expect(earned(history([event("1", five, { provisional: true })]))).not.toContain("perfect");
  });
});

describe("recentPicks", () => {
  test("takes the newest settled picks", () => {
    const h = history([
      event("2", [bout("pending", "pending"), bout("x", "hit", "+50")]),
      event("1", [bout("y", "miss", "−50"), bout("z", "hit", "+50")]),
    ]);
    expect(recentPicks(h).map((b) => b.id)).toEqual(["x", "y", "z"]);
  });
});
