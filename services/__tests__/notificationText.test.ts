import { notificationText, SUPPORT_EMAIL, type ScoredPayload } from "../notificationText";

const fight: ScoredPayload = {
  event: "UFC 332: Silva vs. Wang",
  points: 125,
  correct: true,
  counts: true,
  provisional: false,
  winner: "Alexander Hernandez",
  loser: "Rafael Dos Anjos",
  red: "Rafael Dos Anjos",
  blue: "Alexander Hernandez",
  method: "KO",
  round: 2,
  time: "3:41",
  void: null,
  correction: false,
};

describe("notificationText", () => {
  test("reminder for someone with the main event picked", () => {
    expect(notificationText("reminder", { event: "UFC 333: A vs. B", minutes: 58, hasMainPick: true })).toEqual({
      title: "UFC 333 locks in 58 min",
      body: "Your picks are in. Each part of the card locks as it starts, so change them while you can.",
      data: { screen: "picks" },
    });
  });

  test("reminder nudges someone missing the main event", () => {
    expect(notificationText("reminder", { event: "UFC 333: A vs. B", minutes: 60, hasMainPick: false }).body).toBe(
      "You haven't picked the main event yet. Get your card in before it locks."
    );
  });

  test("a scored fight names the result and your points", () => {
    expect(notificationText("scored", fight)).toEqual({
      title: "Alexander Hernandez def. Rafael Dos Anjos",
      body: "KO/TKO · R2 3:41 — ✓ +125 pts",
      data: { screen: "history" },
    });
  });

  test("a miss on a provisional decision", () => {
    const msg = notificationText("scored", { ...fight, method: "DEC", round: null, time: null, correct: false, points: -80, provisional: true });
    expect(msg.body).toBe("Decision — ✗ −80 pts (provisional)");
  });

  test("a correction says so", () => {
    expect(notificationText("scored", { ...fight, correction: true }).title).toBe("Correction: Alexander Hernandez def. Rafael Dos Anjos");
  });

  test("a void fight explains why it scored nothing", () => {
    const msg = notificationText("scored", { ...fight, winner: null, loser: null, method: null, round: null, points: 0, void: "NC" });
    expect(msg).toMatchObject({ title: "Rafael Dos Anjos vs Alexander Hernandez", body: "No contest. No points either way." });
  });

  test("the recap gives the total", () => {
    expect(notificationText("final", { event: "UFC 332: Silva vs. Wang", points: -40, hit: 8, total: 14 })).toEqual({
      title: "UFC 332 is final",
      body: "You scored −40 pts and called 8 of 14.",
      data: { screen: "history" },
    });
  });

  test("a league join names the player and opens that league", () => {
    expect(
      notificationText("league_join", { league: "Weekend Warriors", leagueId: "lg-1", member: "Sam" })
    ).toEqual({
      title: "Sam joined Weekend Warriors",
      body: "Tap to see where they fit in your league.",
      data: { screen: "league-standings", leagueId: "lg-1" },
    });
  });

  describe("moderation", () => {
    it("asks a warned player to rename, with the reason and where to appeal", () => {
      const m = notificationText("moderation", { action: "warn", reason: "Offensive name." });
      expect(m.title).toBe("Please change your display name");
      expect(m.body).toBe(
        `Your name was reported and breaks our rules. Reason: Offensive name. Change it in Edit Profile. Think this is a mistake? Email ${SUPPORT_EMAIL}.`
      );
      expect(m.data).toEqual({ screen: "edit-profile" });
    });

    it("explains a reset name", () => {
      const m = notificationText("moderation", { action: "reset_name" });
      expect(m.title).toBe("Your display name was reset");
      expect(m.body).toContain("You'll pick a new one the next time you open the app.");
      expect(m.body).not.toContain("Reason:");
    });

    it("says when a suspension ends", () => {
      const m = notificationText("moderation", { action: "suspend", reason: "Spam", until: "2026-10-15T04:00:00Z" });
      expect(m.title).toBe("Your account is suspended");
      expect(m.body).toMatch(/^Until Oct 15, you can look around but can't make picks, join leagues or report players\. Reason: Spam\./);
    });

    it("welcomes a player back after a lift", () => {
      expect(notificationText("moderation", { action: "lift" })).toEqual({
        title: "Your account is back in good standing",
        body: "You can make picks and join leagues again.",
        data: { screen: "picks" },
      });
    });
  });
});
