import {
  leagueChecklist,
  leagueStarted,
  loadChecklistTicks,
  minimumPhrase,
  previewError,
  RateLimitedError,
  rulesSheet,
  saveChecklistTicks,
  TIER_MINIMUM_LINE,
  toLeaguePreview,
} from "../leagueOnboarding";
import type { MyLeague } from "../leagues";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function league(over: Partial<MyLeague> = {}): MyLeague {
  return {
    id: "l1",
    name: "The Alpha League",
    tier: "pro",
    rule: { scope: "main_card", topN: null },
    upgrade: null,
    inviteCode: "AB12CD34",
    isOwner: true,
    members: 5,
    status: "active",
    rank: null,
    record: "0-0",
    points: 0,
    ...over,
  };
}

describe("minimumPhrase", () => {
  it.each([
    [{ scope: "main_card", topN: null }, "the main card"],
    [{ scope: "whole_card", topN: null }, "the whole card"],
    [{ scope: "top_n", topN: 12 }, "the top 12 fights"],
    [{ scope: "main_event", topN: null }, "the main event"],
  ] as const)("reads a Pro rule %j as %s", (rule, phrase) => {
    expect(minimumPhrase("pro", rule)).toBe(phrase);
  });

  it("uses the fixed range for Casual and Amateur, whatever the rule", () => {
    expect(minimumPhrase("casual", { scope: "top_n", topN: 3 })).toBe("the whole main card");
    expect(minimumPhrase("amateur", null)).toBe("the main card and the last 3 prelims");
  });

  it("falls back to the main event when a Pro rule is missing", () => {
    expect(minimumPhrase("pro", null)).toBe("the main event");
  });
});

describe("leagueChecklist", () => {
  it("shows a Pro owner of 5 four steps, two done", () => {
    const list = leagueChecklist(league(), {}, false)!;
    expect(list.steps.map((s) => [s.id, s.done])).toEqual([
      ["invite", true],
      ["tier", true],
      ["minimum", false],
      ["doubleheader", false],
    ]);
    expect([list.done, list.total]).toEqual([2, 4]);
    expect(list.steps[3].detail).toBe("With 5 players, one person plays two matchups each card. Add a 6th to even it out.");
    expect(list.steps[2].detail).toBe(
      "The main card unless you change it. Anyone short forfeits the week; their opponent gets half a win."
    );
  });

  it("leaves the doubleheader step out of an even league", () => {
    const list = leagueChecklist(league({ members: 4 }), {}, false)!;
    expect(list.steps.map((s) => s.id)).toEqual(["invite", "tier", "minimum"]);
  });

  it("counts members toward the invite step", () => {
    const list = leagueChecklist(league({ members: 3 }), {}, false)!;
    expect(list.steps[0]).toMatchObject({ title: "Get to 4 players", done: false, detail: "Leagues are 4–12. You have 3." });
  });

  it.each([1, 3])("has no doubleheader below 4 players (%i), since there are no matchups yet", (members) => {
    const list = leagueChecklist(league({ members }), {}, false)!;
    expect(list.steps.map((s) => s.id)).toEqual(["invite", "tier", "minimum"]);
  });

  it("ticks the fixed minimum for Casual and Amateur", () => {
    const casual = leagueChecklist(league({ tier: "casual", rule: null, members: 5 }), {}, false)!;
    expect(casual.steps[2]).toMatchObject({ title: "Minimum: the whole main card", done: true });
    expect(casual.steps[2].detail).toContain("Fixed for Casual.");
  });

  it("goes away once every step is ticked", () => {
    expect(leagueChecklist(league(), { minimum: true, doubleheader: true }, false)).toBeNull();
    expect(leagueChecklist(league({ tier: "amateur", rule: null, members: 4 }), {}, false)).toBeNull();
  });

  it("is only for the owner, until dismissed or the first card locks", () => {
    expect(leagueChecklist(league({ isOwner: false }), {}, false)).toBeNull();
    expect(leagueChecklist(league(), { dismissed: true }, false)).toBeNull();
    expect(leagueChecklist(league(), {}, true)).toBeNull();
  });

  it("uses 11th, 12th, 13th", () => {
    expect(leagueChecklist(league({ members: 11 }), {}, false)!.steps[3].detail).toContain("Add a 12th");
  });
});

describe("leagueStarted", () => {
  it("trusts the server, so a new season's upcoming week 1 doesn't bring the checklist back", () => {
    expect(leagueStarted(true, [{ state: "upcoming" }])).toBe(true);
    expect(leagueStarted(false, [{ state: "final" }])).toBe(false);
  });

  it("falls back to the weeks when the server can't say", () => {
    expect(leagueStarted(undefined, [])).toBe(false);
    expect(leagueStarted(undefined, [{ state: "upcoming" }])).toBe(false);
    expect(leagueStarted(undefined, [{ state: "upcoming" }, { state: "live" }])).toBe(true);
  });
});

describe("checklist ticks", () => {
  it("round-trips per player and league", async () => {
    await saveChecklistTicks("u1", "l1", { minimum: true });
    expect(await loadChecklistTicks("u1", "l1")).toEqual({ minimum: true });
    expect(await loadChecklistTicks("u2", "l1")).toEqual({});
  });
});

describe("toLeaguePreview", () => {
  it("shapes the row and the Pro rule", () => {
    expect(
      toLeaguePreview([
        { name: "X", tier: "pro", members: 4, max_members: 12, scope: "top_n", top_n: 6, already_member: false, queued: true, is_full: false },
      ])
    ).toEqual({
      name: "X",
      tier: "pro",
      members: 4,
      maxMembers: 12,
      rule: { scope: "top_n", topN: 6 },
      alreadyMember: false,
      queued: true,
      isFull: false,
    });
  });

  it("has no rule for Casual, and null for an unknown code", () => {
    expect(
      toLeaguePreview([
        { name: "X", tier: "casual", members: 2, max_members: 12, scope: null, top_n: null, already_member: true, queued: false, is_full: false },
      ])!.rule
    ).toBeNull();
    expect(toLeaguePreview([])).toBeNull();
  });
});

describe("rulesSheet", () => {
  const pro = { name: "The Alpha League", tier: "pro" as const, members: 4, rule: { scope: "top_n" as const, topN: 12 } };

  it("says what joining adds, including the doubleheader the joiner makes", () => {
    const sheet = rulesSheet(pro, true);
    expect(sheet.title).toBe("Before you join");
    expect(sheet.eyebrow).toBe("PRO LEAGUE");
    expect(sheet.rows.map((r) => r.title)).toEqual([
      "4 to 12 players",
      "Odd count, doubleheader",
      "Pick at least the top 12 fights",
    ]);
  });

  it("counts members as they are for someone already in", () => {
    const sheet = rulesSheet(pro, false);
    expect(sheet.title).toBe("League rules");
    expect(sheet.rows.map((r) => r.icon)).toEqual(["people", "minimum"]);
  });

  it("tells an in-season joiner they wait, and judges the doubleheader without them", () => {
    const sheet = rulesSheet({ ...pro, members: 5, queued: true }, true);
    expect(sheet.rows[0].body).toContain("you join the rotation when the next one starts");
    expect(sheet.rows.map((r) => r.icon)).toEqual(["people", "doubleheader", "minimum"]);
    expect(rulesSheet({ ...pro, queued: true }, true).rows.map((r) => r.icon)).toEqual(["people", "minimum"]);
  });

  it("has no doubleheader for a joiner making 3", () => {
    expect(rulesSheet({ ...pro, members: 2 }, true).rows.map((r) => r.icon)).toEqual(["people", "minimum"]);
  });

  it("shows Amateur's fixed range", () => {
    expect(rulesSheet({ ...pro, tier: "amateur", rule: null }, false).rows.at(-1)!.title).toBe(
      "Pick at least the main card and the last 3 prelims"
    );
  });
});

it("has a create-form line for each open tier", () => {
  expect(TIER_MINIMUM_LINE.pro).toBe("You'll set the minimum picks next.");
  expect(Object.keys(TIER_MINIMUM_LINE)).toEqual(["casual", "amateur", "pro"]);
});

describe("previewError", () => {
  it("says to wait after too many wrong codes, so the join isn't tried", () => {
    const e = previewError({ message: "Too many tries. Wait a bit and try again.", hint: "rate_limited" });
    expect(e).toBeInstanceOf(RateLimitedError);
    expect(e.message).toBe("Too many tries. Wait a bit and try again.");
  });

  it("keeps any other failure a plain error, which falls back to joining", () => {
    const e = previewError({ message: "Could not find the function", hint: null });
    expect(e).not.toBeInstanceOf(RateLimitedError);
    expect(e.message).toBe("Could not find the function");
  });
});
