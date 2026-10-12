import { COMBO_MS, nextGuard } from "../../components/bootCombo";

describe("nextGuard", () => {
  test("ends right after the jab if ready early in the combo", () => {
    expect(nextGuard(0)).toBe(260);
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
