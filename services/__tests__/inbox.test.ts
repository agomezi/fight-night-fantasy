import { notificationHref, timeAgo, toInbox } from "../inbox";

describe("notificationHref", () => {
  it("opens the league a join was in", () => {
    expect(notificationHref({ screen: "league-standings", leagueId: "lg 1" })).toBe("/league-standings?id=lg%201");
  });

  it("goes nowhere for a league link without a league", () => {
    expect(notificationHref({ screen: "league-standings" })).toBeNull();
  });

  it("keeps the card screens", () => {
    expect(notificationHref({ screen: "history" })).toBe("/history");
    expect(notificationHref({ screen: "picks" })).toBe("/picks");
  });

  it("ignores anything it doesn't know", () => {
    expect(notificationHref({ screen: "settings" })).toBeNull();
    expect(notificationHref(undefined)).toBeNull();
    expect(notificationHref("history")).toBeNull();
  });
});

describe("toInbox", () => {
  it("words each item as its push was, with where it goes", () => {
    const [join, final] = toInbox([
      {
        kind: "league_join",
        key: "lg-1:u2:1",
        payload: { league: "Weekend Warriors", leagueId: "lg-1", member: "Sam" },
        sent_at: "2026-10-07T18:00:00Z",
        read: false,
      },
      {
        kind: "final",
        key: "ev-1",
        payload: { event: "UFC 332: Silva vs. Wang", points: 120, hit: 9, total: 14 },
        sent_at: "2026-10-06T04:00:00Z",
        read: true,
      },
    ]);
    expect(join).toEqual({
      key: "league_join:lg-1:u2:1",
      kind: "league_join",
      title: "Sam joined Weekend Warriors",
      body: "Tap to see where they fit in your league.",
      sentAt: new Date("2026-10-07T18:00:00Z"),
      read: false,
      href: "/league-standings?id=lg-1",
    });
    expect(final).toMatchObject({ title: "UFC 332 is final", read: true, href: "/history" });
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it.each([
    ["2026-10-07T11:59:30Z", "now"],
    ["2026-10-07T11:55:00Z", "5m"],
    ["2026-10-07T09:00:00Z", "3h"],
    ["2026-10-05T12:00:00Z", "2d"],
  ])("%s reads as %s", (at, label) => {
    expect(timeAgo(new Date(at), now)).toBe(label);
  });

  it("shows a date after a week", () => {
    expect(timeAgo(new Date("2026-09-20T12:00:00Z"), now)).not.toMatch(/^\d+[mhd]$/);
  });
});
