import { clearDraft, getDraft, samePicks, setDraft, withDraft } from "../pickDraft";

const red = { corner: "red" as const, finish: "ANY" as const };
const blueKo = { corner: "blue" as const, finish: 2 as const, method: "KO" as const };

describe("samePicks", () => {
  it("matches identical cards", () => {
    expect(samePicks({ a: red, b: blueKo }, { a: { ...red }, b: { ...blueKo } })).toBe(true);
  });

  it("sees a cleared pick", () => {
    expect(samePicks({ a: red }, { a: red, b: blueKo })).toBe(false);
  });

  it("sees a changed method", () => {
    expect(samePicks({ b: blueKo }, { b: { ...blueKo, method: "SUB" } })).toBe(false);
  });
});

describe("withDraft", () => {
  it("returns the saved card when there is no draft", () => {
    const saved = { a: red };
    expect(withDraft(saved, undefined, ["a"])).toBe(saved);
  });

  it("uses the draft for open bouts, including a cleared pick", () => {
    expect(withDraft({ a: red, b: blueKo }, { b: blueKo }, ["a", "b"])).toEqual({ b: blueKo });
  });

  it("keeps the saved pick for a bout that has locked", () => {
    expect(withDraft({ a: red }, { a: { ...red, corner: "blue" } }, [])).toEqual({ a: red });
  });
});

describe("draft store", () => {
  it("keeps drafts per user and event until cleared", () => {
    setDraft("u1", "e1", { a: red });
    expect(getDraft("u1", "e1")).toEqual({ a: red });
    expect(getDraft("u2", "e1")).toBeUndefined();
    clearDraft("u1", "e1");
    expect(getDraft("u1", "e1")).toBeUndefined();
  });
});
