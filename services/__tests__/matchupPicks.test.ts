import { toLeagueMatchupPicks, toMatchupPicks, type RawLeagueMatchupPick, type RawMatchupPick } from "../matchupPicks";

const row = (order: number, extra: Partial<RawMatchupPick> = {}): RawMatchupPick => ({
  bout_id: `b${order}`,
  fight_order: order,
  card_segment: order === 1 ? "main" : "prelims",
  locked: true,
  voided: false,
  red_id: "silva",
  red_name: "Natalia Silva",
  blue_id: "cong",
  blue_name: "Wang Cong",
  my_fighter: null,
  my_finish: null,
  my_round: null,
  my_method: null,
  my_points: null,
  their_fighter: null,
  their_finish: null,
  their_round: null,
  their_method: null,
  their_points: null,
  their_locked_in: true,
  ...extra,
});

describe("toMatchupPicks", () => {
  test("puts the card in order, main event first, with both sides' picks", () => {
    const { rows } = toMatchupPicks([
      row(2, { my_fighter: "cong", my_finish: "DEC", their_fighter: "silva", their_finish: "ANY", their_points: 10 }),
      row(1, { my_fighter: "silva", my_finish: "round", my_round: 2, my_method: "KO", my_points: -5 }),
    ]);
    expect(rows.map((r) => r.boutId)).toEqual(["b1", "b2"]);
    expect(rows[0].title).toBe("SILVA vs CONG");
    expect(rows[0].mine).toEqual({ kind: "pick", line: "SILVA · KO/TKO · R2", points: -5 });
    expect(rows[0].theirs).toEqual({ kind: "none" });
    expect(rows[1].mine).toEqual({ kind: "pick", line: "CONG · DEC", points: null });
    expect(rows[1].theirs).toEqual({ kind: "pick", line: "SILVA", points: 10 });
  });

  test("keeps theirs hidden on a bout that hasn't locked", () => {
    const picks = toMatchupPicks([row(1, { locked: false, my_fighter: "silva", my_finish: "ANY" }), row(2)]);
    expect(picks.rows[0].theirs).toEqual({ kind: "hidden" });
    expect(picks.rows[0].mine.kind).toBe("pick");
    expect(picks.someHidden).toBe(true);
  });

  test("says whether they're locked in", () => {
    expect(toMatchupPicks([row(1, { their_locked_in: false })]).theirLockedIn).toBe(false);
    expect(toMatchupPicks([row(1)]).theirLockedIn).toBe(true);
    expect(toMatchupPicks([]).theirLockedIn).toBe(false);
  });
});

const league = (order: number, extra: Partial<RawLeagueMatchupPick> = {}): RawLeagueMatchupPick => ({
  bout_id: `b${order}`,
  fight_order: order,
  card_segment: order === 1 ? "main" : "prelims",
  locked: true,
  voided: false,
  red_id: "silva",
  red_name: "Natalia Silva",
  blue_id: "cong",
  blue_name: "Wang Cong",
  a_shown: true,
  a_fighter: null,
  a_finish: null,
  a_round: null,
  a_method: null,
  a_points: null,
  b_shown: true,
  b_fighter: null,
  b_finish: null,
  b_round: null,
  b_method: null,
  b_points: null,
  a_locked_in: true,
  b_locked_in: false,
  ...extra,
});

describe("toLeagueMatchupPicks", () => {
  test("hides both sides of a bout that hasn't locked, rather than showing no pick", () => {
    const { rows, someHidden } = toLeagueMatchupPicks([league(1, { locked: false, a_shown: false, b_shown: false })]);
    expect(rows[0].mine).toEqual({ kind: "hidden" });
    expect(rows[0].theirs).toEqual({ kind: "hidden" });
    expect(someHidden).toBe(true);
  });

  test("shows each side's pick once locked, side a first", () => {
    const { rows, someHidden } = toLeagueMatchupPicks([
      league(2, { a_fighter: "silva", a_finish: "DEC", a_points: 20, b_fighter: "cong", b_finish: "ANY" }),
      league(1),
    ]);
    expect(rows.map((r) => r.boutId)).toEqual(["b1", "b2"]);
    expect(rows[0].mine).toEqual({ kind: "none" });
    expect(rows[1].mine).toMatchObject({ kind: "pick", points: 20 });
    expect(rows[1].theirs).toMatchObject({ kind: "pick", points: null });
    expect(someHidden).toBe(false);
  });

  test("a side that is you shows before lock while the other stays hidden", () => {
    const { rows } = toLeagueMatchupPicks([league(1, { locked: false, b_shown: false, a_fighter: "cong", a_finish: "DEC" })]);
    expect(rows[0].mine.kind).toBe("pick");
    expect(rows[0].theirs).toEqual({ kind: "hidden" });
  });

  test("says which side is locked in", () => {
    const picks = toLeagueMatchupPicks([league(1)]);
    expect(picks.aLockedIn).toBe(true);
    expect(picks.theirLockedIn).toBe(false);
  });
});
