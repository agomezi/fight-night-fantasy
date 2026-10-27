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

  test("main card reminder counts the fights left to pick", () => {
    expect(
      notificationText("reminder", { event: "UFC 333: A vs. B", minutes: 30, hasMainPick: false, section: "main", missing: 3 })
    ).toEqual({
      title: "Main card starts in 30 min",
      body: "You have 3 main card fights left to pick. Lock in your picks before it starts.",
      data: { screen: "picks" },
    });
    expect(
      notificationText("reminder", { event: "UFC 333: A vs. B", minutes: 30, hasMainPick: true, section: "main", missing: 1 }).body
    ).toBe("You have 1 main card fight left to pick. Lock in your picks before it starts.");
  });

  test("a main event that changed fighters asks for the pick again", () => {
    expect(
      notificationText("reminder", { event: "UFC 333: A vs. B", section: "changed", red: "Silva", blue: "Wang" })
    ).toEqual({
      title: "UFC 333 main event changed",
      body: "It's now Silva vs Wang. Your pick no longer counts, so pick it again before it locks.",
      data: { screen: "picks" },
    });
  });

  test("the day before, a player short of a league's minimum hears what it needs and when", () => {
    expect(
      notificationText("reminder", {
        event: "UFC 334: A vs. B",
        section: "eve",
        minutes: 1290,
        hasMainPick: true,
        league: "Test1",
        required: 12,
        picked: 5,
        leagueMissing: 7,
        firstAt: "2026-10-31T22:00:00Z",
        tz: "America/New_York",
      })
    ).toEqual({
      title: "Test1 needs 12 picks for UFC 334",
      body: "You've made 5. The first fights lock Saturday at 6:00 PM. Miss one and you forfeit this week's matchup.",
      data: { screen: "picks" },
    });
    expect(
      notificationText("reminder", {
        event: "UFC 334: A vs. B", section: "eve", league: "Test1", required: 12, picked: 0,
        firstAt: "2026-10-31T22:00:00Z", tz: "America/New_York",
      }).body
    ).toBe("You haven't made any yet. The first fights lock Saturday at 6:00 PM. Miss one and you forfeit this week's matchup.");
  });

  test("an hour before a later section, the required fights in it still to pick", () => {
    expect(
      notificationText("reminder", {
        event: "UFC 334: A vs. B", section: "segment", segment: "prelims", minutes: 60, league: "Test1", segmentMissing: 4,
      })
    ).toEqual({
      title: "Prelims lock in 60 min",
      body: "Test1 still needs 4 of them from you. Miss one and you forfeit this week's matchup.",
      data: { screen: "picks" },
    });
    expect(
      notificationText("reminder", { event: "UFC 334", section: "segment", segment: "main", minutes: 55, league: "Test1", segmentMissing: 1 }).title
    ).toBe("Main card locks in 55 min");
  });

  test("main card reminder for someone with every main card fight picked", () => {
    expect(
      notificationText("reminder", { event: "UFC 333: A vs. B", minutes: 25, hasMainPick: true, section: "main", missing: 0 }).body
    ).toBe("Your main card picks are in. Last chance to change them before it locks.");
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
    expect(msg.body).toBe("Decision — ✗ −80 pts · may still change");
  });

  test("a result names its bout, so tapping opens history at it", () => {
    expect(notificationText("scored", { ...fight, bout: "b-9" }).data).toEqual({ screen: "history", bout: "b-9" });
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

  test("a result says how much the underdog bonus added", () => {
    const m = notificationText("scored", {
      event: "UFC Fight Night: Allen vs. Duncan", points: 30, dogBonus: 10, correct: true, counts: true,
      provisional: false, winner: "Jai Herbert", loser: "Matheus Camilo", red: "Matheus Camilo", blue: "Jai Herbert",
      method: "DEC", round: null, time: null, void: null, correction: false,
    });
    expect(m.body).toContain("+30 pts (+10 DOG)");
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

    it("tells a player their name is hidden while it's reviewed", () => {
      const m = notificationText("moderation", { action: "under_review" });
      expect(m.title).toBe("Your display name is under review");
      expect(m.body).toBe(
        'Several players reported it, so others see you as "Player" until a moderator checks it. You can keep playing as normal.'
      );
      expect(m.body).not.toContain(SUPPORT_EMAIL);
    });

    it("names the tag others see, and offers a rename, when the note carries it", () => {
      const m = notificationText("moderation", { action: "under_review", alias: 4821 });
      expect(m.body).toBe(
        'Several players reported it, so others see you as "Player #4821" until a moderator checks it. Pick a new name and everyone sees it straight away.'
      );
      expect(m.data).toEqual({ screen: "edit-profile" });
    });

    it("tells a player who renamed that the new name stays", () => {
      for (const action of ["warn", "reset_name"] as const) {
        const m = notificationText("name_kept", { action, reason: "Offensive name" });
        expect(m.title).toBe("Your new name stays");
        expect(m.body).toBe(
          `Your old name broke our rules, so your new name stays. Reason: Offensive name. Think this is a mistake? Email ${SUPPORT_EMAIL}.`
        );
      }
    });

    it("welcomes a player back after a lift", () => {
      expect(notificationText("moderation", { action: "lift" })).toEqual({
        title: "Your account is back in good standing",
        body: "You can make picks and join leagues again.",
        data: { screen: "picks" },
      });
    });
  });

  it("tells a player their name is back after a review", () => {
    expect(notificationText("name_restored", { name: "Kilo_9" })).toEqual({
      title: "Your name is back",
      body: '"Kilo_9" is your name again. A moderator found nothing wrong with it. You can still change it in Edit Profile.',
      data: { screen: "edit-profile" },
    });
  });

  describe("card news", () => {
    const flip = { event: "UFC 333: Volkanovski vs. Evloev", picked: "Alexander Volkanovski", dog: "Alexander Volkanovski", favorite: "Movsar Evloev" };

    it("tells a player their pick became the underdog", () => {
      expect(notificationText("odds", { ...flip, pickedIsDog: true })).toEqual({
        title: "Odds flipped: Volkanovski is now the underdog",
        body: "If it's still that way when the fight locks, your pick is worth 1.5x.",
        data: { screen: "picks" },
      });
    });

    it("drops a suffix from the name", () => {
      expect(notificationText("odds", { ...flip, picked: "Tony Ferguson Jr.", pickedIsDog: true }).title).toBe(
        "Odds flipped: Ferguson is now the underdog"
      );
    });

    it("or the favorite", () => {
      expect(notificationText("odds", { ...flip, pickedIsDog: false }).title).toBe("Odds flipped: Volkanovski is now the favorite");
    });

    // Saturday Oct 24 2026: prelims 10 AM, main card 2 PM Eastern.
    const card = {
      event: "UFC 333: Volkanovski vs. Evloev",
      firstAt: "2026-10-24T14:00:00Z",
      mainAt: "2026-10-24T18:00:00Z",
      hasPrelims: true,
    };

    it("gives an early card's times in the player's zone", () => {
      expect(notificationText("schedule", { ...card, when: "early", tz: "America/New_York" })).toEqual({
        title: "UFC 333 starts earlier than usual",
        body: "Prelims at 10:00 AM, main card at 2:00 PM. Get your picks in before then.",
        data: { screen: "picks" },
      });
      expect(notificationText("schedule", { ...card, when: "early", tz: "America/Los_Angeles" }).body).toBe(
        "Prelims at 7:00 AM, main card at 11:00 AM. Get your picks in before then."
      );
    });

    it("names the day for a card off Saturday, in the player's zone", () => {
      expect(notificationText("schedule", { ...card, when: "day", tz: "Australia/Sydney" }).title).toBe("UFC 333 is on a Sunday");
      expect(notificationText("schedule", { ...card, when: "day", tz: "America/New_York" }).title).toBe(
        "UFC 333 starts at an unusual time"
      );
    });

    it("leaves out the prelims when there are none", () => {
      expect(notificationText("schedule", { ...card, firstAt: card.mainAt, hasPrelims: false, when: "late", tz: "America/New_York" }).body).toBe(
        "Main card at 2:00 PM. Get your picks in before then."
      );
    });

    it("says when a card moved", () => {
      expect(notificationText("schedule", { ...card, when: "moved", tz: "America/New_York" })).toEqual({
        title: "UFC 333 moved",
        body: "The main card now starts at 2:00 PM. Picks lock as each part starts.",
        data: { screen: "picks" },
      });
    });

    it("reads a zone it doesn't know as Eastern", () => {
      expect(notificationText("schedule", { ...card, when: "early", tz: "Not/AZone" }).body).toContain("main card at 2:00 PM");
    });

    it("announces a rank-up and opens the profile", () => {
      expect(notificationText("rank", { rank: "Contender", event: "UFC 333: Volkanovski vs. Evloev" })).toEqual({
        title: "You're now a Contender",
        body: "Your career rank went up. Keep stacking cards.",
        data: { screen: "profile" },
      });
    });
  });
});

describe("poll", () => {
  it("names the new question and opens Home", () => {
    expect(notificationText("poll", { question: "Will any fight end in round 1?", pollId: "p1" })).toEqual({
      title: "New question: Will any fight end in round 1?",
      body: "Vote on Home, then see how everyone else split.",
      data: { screen: "home" },
    });
  });
});
