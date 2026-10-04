import { cleanHandle, handleProblem, nextNameChange } from "../profile";

describe("handleProblem", () => {
  test.each(["abc", "Elite_Striker", "a1_", "x".repeat(20)])("accepts %s", (name) => {
    expect(handleProblem(name)).toBeNull();
  });

  test.each([
    ["ab", "At least 3 characters."],
    ["x".repeat(21), "20 characters at most."],
    ["has space", "Letters, numbers and underscores only."],
    ["emoji🥊", "Letters, numbers and underscores only."],
    ["dash-name", "Letters, numbers and underscores only."],
  ])("refuses %s", (name, reason) => {
    expect(handleProblem(name)).toBe(reason);
  });
});

describe("cleanHandle", () => {
  test("turns spaces into underscores", () => {
    expect(cleanHandle("Alex G")).toBe("Alex_G");
    expect(cleanHandle("Lights  Out")).toBe("Lights_Out");
  });

  test("drops characters a handle can't hold", () => {
    expect(cleanHandle("José-Aldo!🥊")).toBe("JosAldo");
  });

  test("stops at 20 characters", () => {
    expect(cleanHandle("a".repeat(30))).toHaveLength(20);
  });

  test("always produces something handleProblem only rejects for length", () => {
    for (const raw of ["a b", "Ñandú", "x".repeat(40), "__"]) {
      const problem = handleProblem(cleanHandle(raw));
      expect(problem === null || problem.startsWith("At least")).toBe(true);
    }
  });
});

describe("nextNameChange", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  test("a name never changed can be changed now", () => {
    expect(nextNameChange(null, now)).toBeNull();
  });

  test("a name changed three days ago can change again four days later", () => {
    expect(nextNameChange(new Date("2026-10-07T12:00:00Z"), now)?.toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  test("a name changed over a week ago can be changed now", () => {
    expect(nextNameChange(new Date("2026-10-02T12:00:00Z"), now)).toBeNull();
  });
});
