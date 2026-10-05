import { americanOdds, impliedProbability, matchOdds } from "../odds";

// Hand-built responses in the shape of The Odds API's `/sports/{sport}/odds`.
const line = (key: string, ...outcomes: [string, number][]) => ({
  key,
  markets: [{ key: "h2h", outcomes: outcomes.map(([name, price]) => ({ name, price })) }],
});
const event = (home: string, away: string, commence: string, ...bookmakers: unknown[]) => ({
  id: `${home}-${away}`,
  sport_key: "mma_mixed_martial_arts",
  commence_time: commence,
  home_team: home,
  away_team: away,
  bookmakers,
});
const CARD = "2026-10-10T21:00:00Z";
const bout = (boutId: string, red: string, blue: string, startsAt = CARD) => ({ boutId, startsAt, red, blue });

describe("prices", () => {
  test.each([
    [-142, 0.5868],
    [120, 0.4545],
    [-110, 0.5238],
    [100, 0.5],
  ])("%d implies %d", (price, p) => expect(impliedProbability(price)).toBeCloseTo(p, 4));

  test.each([-400, -142, -110, 120, 300])("%d round-trips", (price) =>
    expect(americanOdds(impliedProbability(price))).toBe(price),
  );
});

describe("matchOdds", () => {
  test("puts each price in our corner, whichever way round the API lists the fight", () => {
    const { odds, unmatched } = matchOdds(
      [bout("b1", "Brendan Allen", "Christian Leroy Duncan"), bout("b2", "Kai Kamaka", "Andre Fili")],
      [
        event("Brendan Allen", "Christian Leroy Duncan", "2026-10-11T00:00:00Z",
          line("draftkings", ["Brendan Allen", -142], ["Christian Leroy Duncan", 120])),
        event("Andre Fili", "Kai Kamaka", "2026-10-11T00:00:00Z",
          line("draftkings", ["Kai Kamaka", 130], ["Andre Fili", -155])),
      ],
    );
    expect(unmatched).toEqual([]);
    expect(odds).toEqual([
      { boutId: "b1", redOdds: -142, blueOdds: 120, books: 1 },
      { boutId: "b2", redOdds: 130, blueOdds: -155, books: 1 },
    ]);
  });

  test("averages bookmakers by implied probability", () => {
    const { odds } = matchOdds(
      [bout("b1", "Alice Pereira", "Darya Zheleznyakova")],
      [event("Alice Pereira", "Darya Zheleznyakova", "2026-10-11T00:00:00Z",
        line("draftkings", ["Alice Pereira", -142], ["Darya Zheleznyakova", 120]),
        line("fanduel", ["Darya Zheleznyakova", 110], ["Alice Pereira", -130]))],
    );
    // (0.5868 + 0.5652) / 2 = 0.5760 → -136; (0.4545 + 0.4762) / 2 = 0.4654 → +115
    expect(odds).toEqual([{ boutId: "b1", redOdds: -136, blueOdds: 115, books: 2 }]);
  });

  test("matches across spellings and suffixes", () => {
    const { odds } = matchOdds(
      [bout("b1", "Allen Frye", "RJ Harris")],
      [event("Allen Frye Jr.", "RJ Harris", "2026-10-11T00:00:00Z",
        line("draftkings", ["Allen Frye Jr.", 225], ["RJ Harris", -278]))],
    );
    expect(odds).toEqual([{ boutId: "b1", redOdds: 225, blueOdds: -278, books: 1 }]);
  });

  test("one fighter may be a transliteration away when the other matches exactly", () => {
    const { odds } = matchOdds(
      [bout("b1", "Alice Pereira", "Daria Zhelezniakova")],
      [event("Alice Pereira", "Darya Zheleznyakova", "2026-10-11T00:00:00Z",
        line("draftkings", ["Darya Zheleznyakova", 120], ["Alice Pereira", -142]))],
    );
    expect(odds).toEqual([{ boutId: "b1", redOdds: -142, blueOdds: 120, books: 1 }]);
  });

  test("but not both, and not a different surname", () => {
    const listed = [event("Alicia Pereyra", "Darya Zheleznyakova", "2026-10-11T00:00:00Z",
      line("draftkings", ["Alicia Pereyra", -142], ["Darya Zheleznyakova", 120]))];
    expect(matchOdds([bout("b1", "Alice Pereira", "Daria Zhelezniakova")], listed).odds).toEqual([]);
    expect(matchOdds([bout("b1", "Alicia Pereyra", "Darya Zhelez")], listed).odds).toEqual([]);
    expect(matchOdds([bout("b1", "Alicia Pereyra", "Marya Zheleznyakova")], listed).odds).toEqual([]);
  });

  test("a rematch on another card is not this bout", () => {
    const { odds, unmatched } = matchOdds(
      [bout("b1", "Petr Yan", "Merab Dvalishvili")],
      [event("Petr Yan", "Merab Dvalishvili", "2026-10-25T03:30:00Z",
        line("draftkings", ["Petr Yan", -175], ["Merab Dvalishvili", 145]))],
    );
    expect(odds).toEqual([]);
    expect(unmatched).toEqual(["Petr Yan vs Merab Dvalishvili"]);
  });

  test("one fighter matching is not enough", () => {
    const { unmatched } = matchOdds(
      [bout("b1", "Brendan Allen", "Late Replacement")],
      [event("Brendan Allen", "Christian Leroy Duncan", "2026-10-11T00:00:00Z",
        line("draftkings", ["Brendan Allen", -142], ["Christian Leroy Duncan", 120]))],
    );
    expect(unmatched).toEqual(["Brendan Allen vs Late Replacement"]);
  });

  test("a fight listed twice is ambiguous and skipped", () => {
    const listed = event("Brendan Allen", "Christian Leroy Duncan", "2026-10-11T00:00:00Z",
      line("draftkings", ["Brendan Allen", -142], ["Christian Leroy Duncan", 120]));
    const { odds, unmatched } = matchOdds([bout("b1", "Brendan Allen", "Christian Leroy Duncan")], [listed, listed]);
    expect(odds).toEqual([]);
    expect(unmatched).toHaveLength(1);
  });

  test("a listed fight with no lines yet is reported apart from unmatched", () => {
    const { odds, unmatched, noLines } = matchOdds(
      [bout("b1", "Bo Nickal", "Joseph Pyfer")],
      [event("Bo Nickal", "Joseph Pyfer", "2026-10-10T23:00:00Z")],
    );
    expect(odds).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(noLines).toEqual(["Bo Nickal vs Joseph Pyfer"]);
  });

  test("malformed entries and three-way markets are ignored", () => {
    const { odds } = matchOdds(
      [bout("b1", "Brendan Allen", "Christian Leroy Duncan")],
      [
        null,
        { home_team: "No Date" },
        event("Brendan Allen", "Christian Leroy Duncan", "2026-10-11T00:00:00Z",
          line("draw-book", ["Brendan Allen", -142], ["Christian Leroy Duncan", 120], ["Draw", 5000]),
          line("bad-price", ["Brendan Allen", 0], ["Christian Leroy Duncan", 120]),
          line("draftkings", ["Brendan Allen", -142], ["Christian Leroy Duncan", 120])),
      ],
    );
    expect(odds).toEqual([{ boutId: "b1", redOdds: -142, blueOdds: 120, books: 1 }]);
  });

  test("not a list at all matches nothing", () => {
    expect(matchOdds([bout("b1", "A B", "C D")], { message: "Invalid key" }).unmatched).toHaveLength(1);
  });
});
