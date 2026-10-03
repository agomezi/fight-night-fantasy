import { cleanHandle, handleProblem } from "../profile";

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
