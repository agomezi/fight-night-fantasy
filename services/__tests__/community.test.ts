import { toCommunityView, toPollView, type RawPoll } from "../community";
import { winStyle } from "../events";

const poll = (extra: Partial<RawPoll> = {}): RawPoll => ({
  id: "p1",
  kind: "main_event",
  question: "Does Alex Pereira finish Magomed Ankalaev inside 2 rounds?",
  options: ["yes", "no"],
  event_name: "UFC 333: Pereira vs. Ankalaev",
  closes_at: "2026-10-25T02:00:00Z",
  open: true,
  votes: 0,
  my_vote: null,
  split: null,
  consensus: null,
  outcome: null,
  ...extra,
});

describe("takes", () => {
  test("before you vote there's no split, only the count", () => {
    const v = toPollView(poll({ votes: 41 }));
    expect(v.tag).toBe("MAIN EVENT TAKE");
    expect(v.question).toBe("DOES ALEX PEREIRA FINISH MAGOMED ANKALAEV INSIDE 2 ROUNDS?");
    expect(v.subtitle).toBe("Pereira vs. Ankalaev · vote before it locks");
    expect(v.options.map((o) => o.pct)).toEqual([null, null]);
    expect(v.votes).toBe("41 VOTES");
  });

  test("after you vote, the split", () => {
    const v = toPollView(poll({ votes: 8, my_vote: "yes", split: { yes: 5, no: 3 } }));
    expect(v.options).toEqual([
      { key: "yes", label: "YES", pct: 63, selected: true },
      { key: "no", label: "NO", pct: 38, selected: false },
    ]);
  });

  test("once settled: what the community said, what happened, and whether you called it", () => {
    const v = toPollView(
      poll({
        open: false,
        my_vote: "no",
        split: { yes: 62, no: 38 },
        consensus: { fighter: "Alex Pereira", pct: 71, picks: 20 },
        outcome: "no",
      }),
      true
    );
    expect(v.tag).toBe("LIVE TAKE");
    expect(v.consensus).toBe("71% picked PEREIRA");
    expect(v.outcome).toBe("The community said YES 62%. It was NO.");
    expect(v.verdict).toBe("You called it.");
  });

  test("a called-off take says so and gives no verdict", () => {
    const v = toPollView(poll({ open: false, my_vote: "yes", split: { yes: 1, no: 0 }, outcome: "void" }));
    expect(v.outcome).toBe("Called off. This one doesn't count.");
    expect(v.verdict).toBeNull();
  });
});

describe("cards", () => {
  test("top performers, with the boldest call and how the take went", () => {
    const view = toCommunityView({
      type: "top_performers",
      event_name: "UFC 333: Pereira vs. Ankalaev",
      has_dogs: true,
      players: [
        { place: 1, name: "Ace", points: 300, is_me: false },
        { place: 2, name: "Deuce", points: 120, is_me: true },
      ],
      me: { place: 2, points: 120, field: 9 },
      ball_knowledge: {
        name: "Ace", is_me: false, fighter: "Magomed Ankalaev", finish: "round", finish_round: 2, method: "SUB",
        with_them: 1, on_fight: 9,
      },
      recap: poll({ open: false, my_vote: "yes", split: { yes: 3, no: 1 }, outcome: "no" }),
    });
    expect(view).toEqual({
      type: "board",
      board: {
        tag: "TOP PERFORMERS",
        title: "PEREIRA VS. ANKALAEV",
        subtitle: "The card's best scorers",
        rows: [
          { place: 1, name: "Ace", points: "+300", isMe: false },
          { place: 2, name: "Deuce", points: "+120", isMe: true },
        ],
        lines: [
          "Ball knowledge: Ace called ANKALAEV · SUB · R2 when only 1 of 9 took that side.",
          "The community said YES 75%. It was NO. You missed this one.",
        ],
      },
    });
  });

  test("the league's bottom scorer, joking", () => {
    const view = toCommunityView({
      type: "league", kind: "losers", league_name: "Crew", event_name: "UFC 333: Pereira vs. Ankalaev", players: 5,
      pick: { name: "Joe", is_me: false, points: -15 },
    });
    expect(view.type === "board" && view.board).toMatchObject({
      tag: "CREW · CAN MAN",
      title: "JOE",
      subtitle: "Last in Crew on Pereira vs. Ankalaev with −15. Somebody check on them.",
    });
  });

  test("nothing to show", () => {
    expect(toCommunityView(null)).toEqual({ type: "none" });
  });
});

describe("fighter spotlight", () => {
  const stats = { wins: 5, losses: 1, koWins: 0, subWins: 0, decWins: 5, winStreak: 3 };

  test("a fighter who wins on the cards leads with that, not a 0% finish rate", () => {
    expect(winStyle(stats)).toEqual({ value: "100%", label: "DECISION MERCHANT", line: "Every UFC win on the scorecards (5)." });
    expect(winStyle({ ...stats, koWins: 1, decWins: 4 })?.label).toBe("DECISION MERCHANT");
  });

  test("a finisher keeps the finish rate", () => {
    expect(winStyle({ ...stats, koWins: 3, subWins: 1, decWins: 1 })).toEqual({
      value: "80%", label: "FINISH RATE", line: "Finishes 80% of UFC wins: 3 by KO, 1 by submission.",
    });
  });
});
