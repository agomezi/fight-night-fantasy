import { toBadges } from "../awards";
import { profileLine, titleName, titleOptions } from "../titles";

describe("title options", () => {
  const badges = toBadges([
    { award: "pro_can", season: 3, scope: "Crew", value: 4 },
    { award: "sniper", season: 1, scope: "Crew", value: 0.4 },
    { award: "dog", season: 2, scope: "Global", value: 5 },
    { award: "sniper", season: 3, scope: "Pals", value: 0.5 },
    { award: "not_an_award", season: 3, scope: "Crew", value: 1 },
  ]);

  test("lists each award once, most recently won first, jokes last", () => {
    expect(titleOptions(badges).map((t) => t.award)).toEqual(["sniper", "dog", "pro_can"]);
  });

  test("says where it was last won, and how often", () => {
    const [sniper, dog] = titleOptions(badges);
    expect(sniper).toMatchObject({ title: "Round Sniper", where: "Pals · S3 · 2×" });
    expect(dog.where).toBe("Global · S2");
  });

  test("is empty with no awards won", () => {
    expect(titleOptions([])).toEqual([]);
  });
});

describe("the line under the rank", () => {
  test("waits for the career to load", () => {
    expect(profileLine(null, "Round Sniper")).toBeNull();
  });

  test("shows the pro record, then the title", () => {
    expect(profileLine({ cards: 4, record: "3-1" }, null)).toBe("Pro record 3-1");
    expect(profileLine({ cards: 4, record: "3-1" }, "Round Sniper")).toBe("Pro record 3-1 · Round Sniper");
  });

  test("before a first fight", () => {
    expect(profileLine({ cards: 0, record: "0-0" }, null)).toBe("No fights yet");
  });

  test("names only awards this build knows", () => {
    expect(titleName("sniper")).toBe("Round Sniper");
    expect(titleName("a_future_award")).toBeNull();
    expect(titleName(null)).toBeNull();
  });
});
