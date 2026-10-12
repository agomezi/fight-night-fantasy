import { comboEnd, COMBO_MS, nextGuard } from "../../components/bootCombo";

describe("nextGuard", () => {
  test("ends at once while still in his guard", () => {
    expect(nextGuard(0)).toBe(0);
    expect(nextGuard(COMBO_MS)).toBe(COMBO_MS);
  });

  test("ends right after the jab if ready early in the combo", () => {
    expect(nextGuard(1)).toBe(260);
    expect(nextGuard(260)).toBe(260);
  });

  test("finishes the strike in progress before stopping", () => {
    expect(nextGuard(300)).toBe(520); // mid-cross
    expect(nextGuard(700)).toBe(COMBO_MS); // mid-kick
  });

  test("keeps looping the combo while loading is slow", () => {
    expect(nextGuard(COMBO_MS + 1)).toBe(COMBO_MS + 260);
    expect(nextGuard(3 * COMBO_MS + 600)).toBe(4 * COMBO_MS);
  });
});

describe("comboEnd", () => {
  test("the first launch plays the whole combo, even when ready at once", () => {
    expect(comboEnd(0, true)).toBe(COMBO_MS);
    expect(comboEnd(300, true)).toBe(COMBO_MS);
  });

  test("the first launch still finishes a later strike if loading is slow", () => {
    expect(comboEnd(COMBO_MS + 300, true)).toBe(COMBO_MS + 520);
  });

  test("later launches end at the next guard", () => {
    expect(comboEnd(300, false)).toBe(520);
  });
});
