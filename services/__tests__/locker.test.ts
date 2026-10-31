import { beltFor, beltLabel, shown, toLocker } from "../locker";

describe("the belt", () => {
  test("is white with no stripes for a new player", () => {
    expect(beltFor(0)).toEqual({ rank: "Prospect", stripes: 0 });
  });

  test("gains a stripe for each fifth of the way to the next rank, up to four", () => {
    // Contender runs from 5 to 15 points.
    expect(beltFor(5)).toEqual({ rank: "Contender", stripes: 0 });
    expect(beltFor(7)).toEqual({ rank: "Contender", stripes: 1 });
    expect(beltFor(14)).toEqual({ rank: "Contender", stripes: 4 });
    expect(beltFor(15)).toEqual({ rank: "Ranked", stripes: 0 });
  });

  test("turns black at 75 points and red at 155, like the belt others see", () => {
    expect(beltFor(74)).toEqual({ rank: "Title Challenger", stripes: 4 });
    expect(beltFor(75)).toEqual({ rank: "Champion", stripes: 0 });
    expect(beltFor(154)).toEqual({ rank: "Champion", stripes: 4 });
    expect(beltFor(155)).toEqual({ rank: "Legend", stripes: 0 });
  });

  test("is red with no stripes at Legend", () => {
    expect(beltFor(400)).toEqual({ rank: "Legend", stripes: 0 });
  });

  test("is named by its colour in the locker", () => {
    expect(beltLabel({ rank: "Contender", stripes: 2 })).toEqual({ title: "Blue belt", sub: "Contender · 2 stripes" });
    expect(beltLabel({ rank: "Champion", stripes: 1 })).toEqual({ title: "Black belt", sub: "Champion · 1 stripe" });
    expect(beltLabel({ rank: "Prospect", stripes: 0 })).toEqual({ title: "White belt", sub: "Prospect" });
  });
});

describe("a locker", () => {
  const raw = {
    belt: { rank: "Contender", stripes: 1 },
    badges: [{ id: "og" }, { id: "season_veteran", seasons: [1, 2] }, { id: "a_future_badge" }],
    hidden: ["og", "a_future_item"],
  };

  test("reads the belt, known badges with what they're for, and what's hidden", () => {
    const locker = toLocker(raw)!;
    expect(locker.belt).toEqual({ rank: "Contender", stripes: 1 });
    expect(locker.badges.map((b) => [b.id, b.blurb])).toEqual([
      ["og", "Played the pre-season, before Season 1."],
      ["season_veteran", "Played every card of Season 1, Season 2."],
    ]);
    expect(locker.hidden).toEqual(["og"]);
  });

  test("shows only what you haven't hidden on your card", () => {
    const card = shown(toLocker({ ...raw, hidden: ["og", "belt"] }))!;
    expect(card.belt).toBeNull();
    expect(card.badges.map((b) => b.id)).toEqual(["season_veteran"]);
  });

  test("is nothing for a player you can't see", () => {
    expect(toLocker(null)).toBeNull();
    expect(toLocker({ belt: null, badges: [], hidden: [] })!.belt).toBeNull();
  });

  test("leaves out a belt this build doesn't know", () => {
    expect(toLocker({ belt: { rank: "Grandmaster", stripes: 2 }, badges: [], hidden: [] })!.belt).toBeNull();
  });
});
