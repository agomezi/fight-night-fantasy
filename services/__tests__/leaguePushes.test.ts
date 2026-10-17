import { notificationHref, toInbox } from "../inbox";
import { notificationText, ordinal } from "../notificationText";

describe("lead change pushes", () => {
  const base = { event: "UFC Fight Night: Buckley vs. Malott", league: "Gym League", leagueId: "lg1", opponent: "Ben" };

  it("tells the new leader they passed their opponent", () => {
    expect(notificationText("matchup", { ...base, mine: 82, theirs: 75, lead: true })).toEqual({
      title: "You passed Ben",
      body: "You're up 7 in Gym League (82–75).",
      data: { screen: "matchup", leagueId: "lg1" },
    });
  });

  it("tells the other side they were overtaken", () => {
    expect(notificationText("matchup", { ...base, mine: 75, theirs: 82, lead: false })).toMatchObject({
      title: "Ben overtook you",
      body: "You're down 7 in Gym League (75–82).",
    });
  });

  it("opens the matchup it's about, for a doubleheader week", () => {
    const { data } = notificationText("matchup", { ...base, opponentId: "u2", mine: 1, theirs: 0, lead: true });
    expect(data).toEqual({ screen: "matchup", leagueId: "lg1", opponent: "u2" });
    expect(notificationHref(data)).toBe("/matchup?id=lg1&vs=u2");
  });

  it("reads the opponent off the key for inbox rows sent without it", () => {
    const [item] = toInbox([
      {
        kind: "matchup",
        key: "ev1:lg1:u2:1",
        payload: { ...base, mine: 1, theirs: 0, lead: true },
        sent_at: "2026-10-17T02:00:00Z",
        read: false,
      },
    ]);
    expect(item.href).toBe("/matchup?id=lg1&vs=u2");
  });

  it("opens the head-to-head screen for that league", () => {
    expect(notificationHref({ screen: "matchup", leagueId: "lg 1" })).toBe("/matchup?id=lg%201");
    expect(notificationHref({ screen: "matchup" })).toBeNull();
  });
});

describe("main card standing pushes", () => {
  const event = "UFC Fight Night: Buckley vs. Malott";

  it("names the rank in one league", () => {
    expect(
      notificationText("standing", { event, leagues: [{ league: "Gym League", leagueId: "lg1", rank: 3, tied: false }] })
    ).toEqual({
      title: "UFC Fight Night main card is starting",
      body: "You're 3rd in Gym League going in.",
      data: { screen: "league-standings", leagueId: "lg1" },
    });
  });

  it("lists several leagues, ties included", () => {
    const leagues = [
      { league: "Work", leagueId: "a", rank: 1, tied: false },
      { league: "Gym", leagueId: "b", rank: 2, tied: true },
      { league: "Family", leagueId: "c", rank: 11, tied: false },
    ];
    expect(notificationText("standing", { event, leagues }).body).toBe(
      "You're 1st in Work, tied 2nd in Gym and 11th in Family going in."
    );
    expect(notificationText("standing", { event, leagues: leagues.slice(0, 2) }).body).toBe(
      "You're 1st in Work and tied 2nd in Gym going in."
    );
  });

  it("goes to Leagues if it somehow lists none", () => {
    expect(notificationHref(notificationText("standing", { event, leagues: [] }).data)).toBe("/leagues");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [102, "102nd"],
  ])("%i is %s", (n, label) => {
    expect(ordinal(n)).toBe(label);
  });
});
