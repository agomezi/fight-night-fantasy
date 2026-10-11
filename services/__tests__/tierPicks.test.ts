import { lockInNeeds, requiredBouts, tierBouts, type TierBout } from "../tierPicks";

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
