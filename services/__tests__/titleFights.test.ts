import { notificationText } from "../notificationText";
import { champLine, hasTitle, matchupTitle, titleShotCut, toLeagueTitle, type LeagueTitle } from "../titleFights";

const side = (userId: string, name = userId) => ({ userId, name, points: null });

const base = (over: Partial<LeagueTitle> = {}): LeagueTitle => ({
  preseason: false,
  champion: null,
  seedsFinal: true,
  seeds: [1, 2, 3, 4, 5].map((seed) => ({ seed, userId: `u${seed}` })),
  bracket: [],
  ...over,
});

describe("toLeagueTitle", () => {
  it("reads the pre-season as no title", () => {
    expect(toLeagueTitle({ season: null, champion: null, seedsFinal: false, seeds: null, bracket: null })).toEqual({
      preseason: true,
      champion: null,
      seedsFinal: false,
      seeds: [],
      bracket: [],
    });
  });
});

describe("matchupTitle", () => {
  it("tags the play-in and semifinals as a title shot, with the seeds", () => {
    const title = base({
      bracket: [
        { stage: "play_in", week: 9, eventId: "e9", a: "u4", b: "u5" },
        { stage: "semi", week: 10, eventId: "e10", a: "u2", b: "u3" },
      ],
    });
    expect(matchupTitle(title, { eventId: "e9", a: side("u5"), b: side("u4"), isMine: true }, "Test1")).toEqual({
      tag: "TITLE SHOT",
      line: "Play-in · #4 vs #5 · the winner goes to the semis",
      championId: null,
    });
    expect(matchupTitle(title, { eventId: "e10", a: side("u2"), b: side("u3"), isMine: true }, "Test1")?.line).toBe(
      "Semifinal · #2 vs #3 · the winner fights for the belt",
    );
  });

  it("tags card 11's final as the title fight", () => {
    const title = base({ bracket: [{ stage: "title", week: 11, eventId: "e11", a: "u1", b: "u3" }] });
    expect(matchupTitle(title, { eventId: "e11", a: side("u3"), b: side("u1"), isMine: true }, "Test1")).toMatchObject({
      tag: "TITLE FIGHT",
      line: "For the Test1 belt",
    });
  });

  it("tags the Champion's matchup as a title fight", () => {
    const title = base({ champion: { userId: "u2", name: "Rook Vale", defenses: 1 } });
    expect(matchupTitle(title, { eventId: "e3", a: side("u2"), b: side("u6"), isMine: true }, "Test1")).toEqual({
      tag: "TITLE FIGHT",
      line: "You defend the Test1 belt",
      championId: "u2",
    });
    expect(matchupTitle(title, { eventId: "e3", a: side("u6"), b: side("u2"), isMine: true }, "Test1")?.line).toBe(
      "Rook Vale defends the Test1 belt",
    );
  });

  it("leaves other matchups, a matchup on another card, and the pre-season alone", () => {
    const title = base({
      champion: { userId: "u2", name: "Rook Vale", defenses: 0 },
      bracket: [{ stage: "semi", week: 10, eventId: "e10", a: "u1", b: "u4" }],
    });
    expect(matchupTitle(title, { eventId: "e10", a: side("u5"), b: side("u6"), isMine: true }, "T")).toBeNull();
    expect(matchupTitle(title, { eventId: "e9", a: side("u1"), b: side("u4"), isMine: true }, "T")).toBeNull();
    expect(matchupTitle({ ...title, preseason: true }, { eventId: "e1", a: side("u2"), b: side("u6"), isMine: true }, "T")).toBeNull();
    expect(matchupTitle(null, { eventId: "e1", a: side("u2"), b: side("u6"), isMine: true }, "T")).toBeNull();
  });
});

describe("titleShotCut", () => {
  it("draws the line under the last projected seed", () => {
    expect(titleShotCut(base({ seedsFinal: false }))).toBe("u5");
    expect(titleShotCut(base({ seedsFinal: false, seeds: base().seeds.slice(0, 4) }))).toBe("u4");
  });
  it("has no line once the field is set, without a field, or in the pre-season", () => {
    expect(titleShotCut(base())).toBeNull();
    expect(titleShotCut(base({ seedsFinal: false, seeds: [] }))).toBeNull();
    expect(titleShotCut(base({ seedsFinal: false, preseason: true }))).toBeNull();
  });
});

describe("hasTitle", () => {
  it("shows the C slot with a Champion or a field, not in a league too small for one", () => {
    expect(hasTitle(base())).toBe(true);
    expect(hasTitle(base({ seeds: [], champion: { userId: "u1", name: "A", defenses: 0 } }))).toBe(true);
    expect(hasTitle(base({ seeds: base().seeds.slice(0, 3) }))).toBe(false);
    expect(hasTitle(base({ preseason: true }))).toBe(false);
    expect(hasTitle(null)).toBe(false);
  });
});

describe("champLine", () => {
  it("says vacant until the title fight, then the defenses", () => {
    expect(champLine(base())).toBe("DECIDED ON THE TITLE FIGHT, CARD 11");
    expect(champLine(base({ champion: { userId: "u1", name: "A", defenses: 0 } }))).toBe("CHAMPION");
    expect(champLine(base({ champion: { userId: "u1", name: "A", defenses: 3 } }))).toBe("CHAMPION · 3 DEFENSES");
  });
});

describe("title pushes", () => {
  const p = { league: "Test1", leagueId: "l1", opponent: "Tam Orrin", defenses: null };
  it("says what's on the line before the card", () => {
    expect(notificationText("title", { ...p, type: "tonight", stage: "defense" })).toEqual({
      title: "Title fight: you defend the Test1 belt",
      body: "Against Tam Orrin. Lose and the title goes vacant.",
      data: { screen: "league-standings", leagueId: "l1" },
    });
    expect(notificationText("title", { ...p, type: "tonight", stage: "semi" }).title).toBe(
      "Title shot: your semifinal in Test1",
    );
  });
  it("says what happened after it", () => {
    expect(notificationText("title", { ...p, type: "lost_title", stage: null }).body).toBe(
      "Tam Orrin beat you. The title is vacant until the next title fight.",
    );
    expect(notificationText("title", { ...p, type: "defended", stage: null, defenses: 2 }).body).toBe("2 defenses and counting.");
    expect(notificationText("title", { ...p, type: "champion", stage: "title" }).title).toBe("New Champion. You won the Test1 belt");
    expect(notificationText("title", { ...p, type: "champion", stage: "title", drawn: true }).body).toBe(
      "The title fight with Tam Orrin was a draw, and the better seed takes it. Defend it every card.",
    );
    expect(notificationText("title", { ...p, type: "lost_title", stage: "title" }).body).toBe(
      "Tam Orrin won the title fight and is the new Champion.",
    );
    expect(notificationText("title", { ...p, type: "advanced", stage: "play_in" }).body).toBe(
      "You beat Tam Orrin. Next: the semifinals.",
    );
  });
  it("says why the belt went when the Champion didn't lose", () => {
    expect(notificationText("title", { ...p, type: "lost_title", stage: "field", opponent: null }).body).toBe(
      "You finished outside the title picture. The title is vacant until the title fight.",
    );
    expect(notificationText("title", { ...p, type: "champion", stage: "walkover", opponent: null }).body).toBe(
      "Your title fight opponent left the league, so the belt is yours. Defend it every card.",
    );
  });
});
