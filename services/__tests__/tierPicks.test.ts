import { fightNeeds, globalStatus, lockInNeeds, requiredBouts, tierBouts, type TierBout } from "../tierPicks";

// Main event first: 2 main card, 4 prelims, 2 early prelims.
const card: TierBout[] = [
  { id: "m1", segment: "main" },
  { id: "m2", segment: "main" },
  { id: "p1", segment: "prelims" },
  { id: "p2", segment: "prelims" },
  { id: "p3", segment: "prelims" },
  { id: "p4", segment: "prelims" },
  { id: "e1", segment: "early_prelims" },
  { id: "e2", segment: "early_prelims" },
];
const ids = (bouts: TierBout[]) => bouts.map((b) => b.id);

test("each tier plays its part of the card", () => {
  expect(ids(tierBouts("casual", card))).toEqual(["m1", "m2"]);
  expect(ids(tierBouts("amateur", card))).toEqual(["m1", "m2", "p1", "p2", "p3"]);
  expect(ids(tierBouts("pro", card))).toHaveLength(8);
  expect(ids(tierBouts("hardcore", card))).toHaveLength(8);
});

test("Casual and Amateur require all of it, Pro and Hardcore the main event", () => {
  expect(ids(requiredBouts("casual", card))).toEqual(["m1", "m2"]);
  expect(ids(requiredBouts("amateur", card))).toEqual(["m1", "m2", "p1", "p2", "p3"]);
  expect(ids(requiredBouts("pro", card))).toEqual(["m1"]);
});

test("a bout entered by hand counts as main card", () => {
  expect(ids(tierBouts("casual", [{ id: "x", segment: null }]))).toEqual(["x"]);
});

describe("lockInNeeds", () => {
  const all = () => true;
  test("the main event, with no leagues at all", () => {
    expect(lockInNeeds([], card, () => false, all)).toEqual({ missing: ["m1"], league: null });
  });

  test("the strictest league decides, and is named", () => {
    const picked = new Set(["m1", "m2"]);
    const need = lockInNeeds(
      [
        { name: "Pros", tier: "pro" },
        { name: "Amateurs", tier: "amateur" },
      ],
      card,
      (id) => picked.has(id),
      all
    );
    expect(need).toEqual({ missing: ["p1", "p2", "p3"], league: "Amateurs" });
  });

  test("bouts that already locked aren't asked for", () => {
    const need = lockInNeeds([{ name: "Amateurs", tier: "amateur" }], card, (id) => id === "m1" || id === "m2", (b) =>
      b.segment === "main"
    );
    expect(need).toEqual({ missing: [], league: null });
  });
});

describe("a Pro league's minimum picks", () => {
  test("follows the owner's rule", () => {
    expect(ids(requiredBouts("pro", card, { scope: "main_event", topN: null }))).toEqual(["m1"]);
    expect(ids(requiredBouts("pro", card, { scope: "main_card", topN: null }))).toEqual(["m1", "m2"]);
    expect(ids(requiredBouts("pro", card, { scope: "top_n", topN: 4 }))).toEqual(["m1", "m2", "p1", "p2"]);
    expect(ids(requiredBouts("hardcore", card, { scope: "whole_card", topN: null }))).toHaveLength(8);
  });

  test("is ignored by Casual and Amateur, whose range is fixed", () => {
    expect(ids(requiredBouts("casual", card, { scope: "whole_card", topN: null }))).toEqual(["m1", "m2"]);
  });

  test("holds the lock-in button for the league asking the most", () => {
    const need = lockInNeeds(
      [
        { name: "Easy", tier: "casual" },
        { name: "Strict", tier: "pro", rule: { scope: "top_n", topN: 5 } },
      ],
      card,
      (id) => id === "m1",
      () => true
    );
    expect(need).toEqual({ missing: ["m2", "p1", "p2", "p3"], league: "Strict" });
  });
});

describe("what each fight counts toward", () => {
  const leagues = [
    { name: "Easy", tier: "casual" as const },
    { name: "Strict", tier: "pro" as const, rule: { scope: "top_n" as const, topN: 4 } },
  ];

  test("names the leagues that require it, and marks the main card for global", () => {
    const needs = fightNeeds(leagues, card);
    expect(needs.m1).toEqual({ leagues: ["Easy", "Strict"], global: true });
    expect(needs.p2).toEqual({ leagues: ["Strict"], global: false });
    expect(needs.e1).toEqual({ leagues: [], global: false });
  });

  test("says whether the card will count on global", () => {
    const open = () => true;
    expect(globalStatus(card, (id) => id.startsWith("m"), open)).toEqual({ state: "counts" });
    expect(globalStatus(card, (id) => id === "m1", open)).toEqual({ state: "short", left: 1 });
    expect(globalStatus(card, (id) => id === "m1", (b) => b.id !== "m2")).toEqual({ state: "missed" });
  });
});
