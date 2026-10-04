import { parseCard, upcomingEventSlugs, eventFmid } from "../card";

// Hand-built payloads in the live-stats feed's shape, trimmed to the fields the
// parser reads. Values mirror a real upcoming card.
type Overrides = Record<string, unknown>;
function fighter(id: number, first: string | null, last: string, corner: string, nick: string | null = null) {
  return { FighterId: id, Name: { FirstName: first, LastName: last, NickName: nick }, Corner: corner };
}
function fight(id: number, order: number, segment: string | null, start: string | null, overrides: Overrides = {}) {
  return {
    FightId: id,
    FightOrder: order,
    CardSegment: segment,
    CardSegmentStartTime: start,
    Fighters: [fighter(id * 10 + 1, "Red", `Fighter ${order}`, "Red"), fighter(id * 10 + 2, "Blue", `Fighter ${order}`, "Blue")],
    WeightClass: { Description: "Lightweight" },
    Accolades: [],
    RuleSet: { PossibleRounds: 3, Description: "3 Rnd (5-5-5)" },
    ...overrides,
  };
}
function payload(overrides: Overrides = {}, fights?: unknown[]) {
  return {
    LiveEventDetail: {
      EventId: 1338,
      Name: "UFC 332: Silva vs. Wang",
      StartTime: "2026-10-03T20:00Z",
      Status: "Upcoming",
      Organization: { OrganizationId: 1, Name: "Ultimate Fighting Championship" },
      FightCard: fights ?? [
        fight(13120, 1, "Main", "2026-10-04T00:00Z", {
          Fighters: [fighter(3623, "Natalia", "Silva", "Red"), fighter(4177, "Wang", "Cong", "Blue", "The Joker")],
          WeightClass: { Description: "Women's Flyweight" },
          Accolades: [{ Type: "Belt", Name: "UFC Women's Flyweight Title" }],
          RuleSet: { PossibleRounds: 5, Description: "5 Rnd (5-5-5-5-5)" },
        }),
        fight(13070, 2, "Main", "2026-10-04T00:00Z"),
        fight(13074, 3, "Prelims1", "2026-10-03T22:00Z"),
        fight(13071, 4, "Prelims2", "2026-10-03T20:00Z"),
      ],
      ...overrides,
    },
  };
}

describe("parseCard", () => {
  test("reads event identity, start, status and every bout", () => {
    const card = parseCard(payload())!;
    expect(card).toMatchObject({ ufcEventId: "1338", name: "UFC 332: Silva vs. Wang", startsAt: "2026-10-03T20:00:00.000Z", status: "scheduled", issues: [] });
    expect(card.bouts.map(b => [b.ufcFightId, b.order, b.segment, b.scheduledRounds])).toEqual([
      ["13120", 1, "main", 5],
      ["13070", 2, "main", 3],
      ["13074", 3, "prelims", 3],
      ["13071", 4, "early_prelims", 3],
    ]);
    expect(card.bouts[0]).toEqual({
      ufcFightId: "13120", order: 1, segment: "main", scheduledRounds: 5, weightClass: "Women's Flyweight",
      locksAt: "2026-10-04T00:00:00.000Z",
      red: { ufcFighterId: "3623", name: "Natalia Silva", nickname: null },
      blue: { ufcFighterId: "4177", name: "Wang Cong", nickname: "The Joker" },
    });
    expect(parseCard(payload())).toEqual(card);
  });

  test("the card starts at its earliest segment, even when the event start is later", () => {
    expect(parseCard(payload({ StartTime: "2026-10-04T00:00Z" }))!.startsAt).toBe("2026-10-03T20:00:00.000Z");
  });

  test("a card UFC has not split yet keeps null segments and the event start", () => {
    const card = parseCard(payload({ StartTime: "2026-11-21T22:00Z" }, [fight(13197, 1, null, null), fight(13198, 2, null, null)]))!;
    expect(card.bouts.map(b => b.segment)).toEqual([null, null]);
    expect(card.startsAt).toBe("2026-11-21T22:00:00.000Z");
  });

  test("each bout locks when its own part of the card starts", () => {
    expect(parseCard(payload())!.bouts.map(b => [b.order, b.locksAt])).toEqual([
      [1, "2026-10-04T00:00:00.000Z"],
      [2, "2026-10-04T00:00:00.000Z"],
      [3, "2026-10-03T22:00:00.000Z"],
      [4, "2026-10-03T20:00:00.000Z"],
    ]);
  });

  test("before the card is split, every bout locks at the event start", () => {
    const card = parseCard(payload({ StartTime: "2026-11-21T22:00Z" }, [fight(13197, 1, null, null), fight(13198, 2, null, null)]))!;
    expect(card.bouts.map(b => b.locksAt)).toEqual(["2026-11-21T22:00:00.000Z", "2026-11-21T22:00:00.000Z"]);
  });

  test("bouts come out in card order whatever order the feed lists them", () => {
    const card = parseCard(payload({}, [fight(2, 2, "Main", null), fight(1, 1, "Main", null)]))!;
    expect(card.bouts.map(b => b.ufcFightId)).toEqual(["1", "2"]);
  });

  test.each([["Upcoming", "scheduled"], ["Live", "live"], ["Over", "complete"], ["Final", "complete"]])("status %s maps to %s", (feed, status) => {
    expect(parseCard(payload({ Status: feed }))!.status).toBe(status);
  });

  test("other organizations are not synced", () => {
    expect(parseCard(payload({ Organization: { OrganizationId: 67, Name: "Dana White's Contender Series" } }))).toBeNull();
    expect(parseCard(payload({ Organization: { OrganizationId: 68, Name: "Road to UFC" } }))).toBeNull();
  });

  test("a single-name fighter keeps the name they have", () => {
    const card = parseCard(payload({}, [fight(1, 1, "Main", null, { Fighters: [fighter(1, null, "Mizuki", "Red"), fighter(2, "  Ana ", " Silva ", "Blue")] })]))!;
    expect(card.bouts[0].red.name).toBe("Mizuki");
    expect(card.bouts[0].blue.name).toBe("Ana Silva");
  });

  describe("scheduled rounds", () => {
    const rounds = (ruleSet: unknown, overrides: Overrides = {}, order = 2) =>
      parseCard(payload({}, [fight(1, order, "Main", null, { RuleSet: ruleSet, ...overrides })]))!;

    test("'3 Rnd + OT' is read from its description and flagged", () => {
      const card = rounds({ PossibleRounds: 4, Description: "3 Rnd + OT (5-5-5-5)" }, {}, 1);
      expect(card.bouts[0].scheduledRounds).toBe(3);
      expect(card.issues).toEqual(['Fight 1 lists 4 rounds ("3 Rnd + OT (5-5-5-5)"); using 3']);
    });
    test("without a usable rule set, main events go five", () => expect(rounds(null, {}, 1).bouts[0].scheduledRounds).toBe(5));
    test("without a usable rule set, title fights go five", () => expect(rounds(null, { Accolades: [{ Type: "Belt" }] }).bouts[0].scheduledRounds).toBe(5));
    test("without a usable rule set, other bouts go three", () => {
      const card = rounds(null);
      expect(card.bouts[0].scheduledRounds).toBe(3);
      expect(card.issues).toHaveLength(1);
    });
  });

  describe("structural failures throw rather than produce a partial card", () => {
    // A partial card is dangerous: the sync cancels any bout it does not see.
    test("no fights", () => expect(() => parseCard(payload({ FightCard: [] }))).toThrow("has no fights"));
    test("unknown status", () => expect(() => parseCard(payload({ Status: "Postponed" }))).toThrow("Unknown status"));
    test("unknown segment", () => expect(() => parseCard(payload({}, [fight(1, 1, "Prelims3", null)]))).toThrow("Unknown card segment"));
    test("missing fight id", () => expect(() => parseCard(payload({}, [fight(0, 1, "Main", null)]))).toThrow("Missing fight id"));
    test("missing fighter id", () =>
      expect(() => parseCard(payload({}, [fight(1, 1, "Main", null, { Fighters: [fighter(0, "A", "B", "Red"), fighter(2, "C", "D", "Blue")] })]))).toThrow("Missing fighter id"));
    test("one fighter", () => expect(() => parseCard(payload({}, [fight(1, 1, "Main", null, { Fighters: [fighter(1, "A", "B", "Red")] })]))).toThrow("two fighters"));
    test("two red corners", () =>
      expect(() => parseCard(payload({}, [fight(1, 1, "Main", null, { Fighters: [fighter(1, "A", "B", "Red"), fighter(2, "C", "D", "Red")] })]))).toThrow("one red and one blue"));
    test("the same fighter twice", () =>
      expect(() => parseCard(payload({}, [fight(1, 1, "Main", null, { Fighters: [fighter(1, "A", "B", "Red"), fighter(1, "A", "B", "Blue")] })]))).toThrow("Duplicate fighter"));
    test("duplicate fight ids", () => expect(() => parseCard(payload({}, [fight(1, 1, "Main", null), fight(1, 2, "Main", null)]))).toThrow("Duplicate fight ids"));
    test("duplicate fight order", () => expect(() => parseCard(payload({}, [fight(1, 1, "Main", null), fight(2, 1, "Main", null)]))).toThrow("Duplicate fight order"));
    test("invalid start time", () => expect(() => parseCard(payload({ StartTime: "TBA" }))).toThrow("start time"));
    test("not an object", () => expect(() => parseCard("<html>Access denied</html>")).toThrow());
  });
});

describe("UFC.com discovery", () => {
  const listing = `
    <a href="/event/ufc-330">nav link, outside both lists</a>
    <div id="events-list-upcoming">
      <a href="/event/ufc-332">UFC 332</a><a href="/event/ufc-332">View Event Details</a>
      <a href="/event/ufc-fight-night-october-10-2026">Fight Night</a>
      <a href="/event/ufc-fight-night-october-10-2026#main-card">anchor</a>
    </div>
    <div id="events-list-past"><a href="/event/ufc-331">UFC 331</a></div>`;

  test("upcoming slugs come only from the upcoming section, once each, in page order", () => {
    expect(upcomingEventSlugs(listing)).toEqual(["ufc-332", "ufc-fight-night-october-10-2026"]);
  });
  test("a listing without an upcoming section fails loudly", () => {
    expect(() => upcomingEventSlugs("<h1>Access denied</h1>")).toThrow("no upcoming section");
  });
  test("the feed id is read from the event page settings", () => {
    expect(eventFmid('<script>{"path":"/event/ufc-332","event_fmid":"1338","x":1}</script>')).toBe("1338");
  });
  test("a card not yet in the feed has no feed id", () => {
    expect(eventFmid('<div class="c-listing-fight" data-fmid="">')).toBeNull();
  });
});
