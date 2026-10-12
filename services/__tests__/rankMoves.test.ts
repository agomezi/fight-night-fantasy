import { trackMoves, type RankSnapshot } from "../rankMoves";

describe("trackMoves", () => {
  test("the first look has nothing to compare against", () => {
    const { snapshot, moves } = trackMoves(null, { a: 1, b: 2 }, 1, false);
    expect(moves).toEqual({});
    expect(snapshot).toEqual({ finals: 1, base: { a: 1, b: 2 }, prev: null });
  });

  test("a live card is measured against the table before it", () => {
    const stored: RankSnapshot = { finals: 1, base: { a: 1, b: 2, c: 3 }, prev: null };
    const { snapshot, moves } = trackMoves(stored, { a: 2, b: 3, c: 1 }, 1, true);
    expect(moves).toEqual({ a: -1, b: -1, c: 2 });
    // Nothing is saved mid-card, so the base stays the pre-card table.
    expect(snapshot).toBe(stored);
  });

  test("once the card is final, the movement it caused stays until the next", () => {
    const stored: RankSnapshot = { finals: 1, base: { a: 1, b: 2, c: 3 }, prev: null };
    const after = trackMoves(stored, { a: 2, b: 3, c: 1 }, 2, false);
    expect(after.moves).toEqual({ a: -1, b: -1, c: 2 });
    expect(after.snapshot).toEqual({ finals: 2, base: { a: 2, b: 3, c: 1 }, prev: { a: 1, b: 2, c: 3 } });

    const later = trackMoves(after.snapshot, { a: 2, b: 3, c: 1 }, 2, false);
    expect(later.moves).toEqual({ a: -1, b: -1, c: 2 });
  });

  test("someone ranked for the first time has no movement", () => {
    const stored: RankSnapshot = { finals: 1, base: { a: 1 }, prev: null };
    expect(trackMoves(stored, { a: 2, b: 1 }, 1, true).moves).toEqual({ a: -1 });
  });

  test("a new season starts over", () => {
    const stored: RankSnapshot = { finals: 6, base: { a: 1 }, prev: { a: 2 } };
    expect(trackMoves(stored, { a: 3 }, 0, false)).toEqual({ snapshot: { finals: 0, base: { a: 3 }, prev: null }, moves: {} });
  });
});
