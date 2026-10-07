import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearDraft, loadDraft, resetDraftCache, samePicks, setDraft, withDraft } from "../pickDraft";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

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
  beforeEach(async () => {
    resetDraftCache();
    await AsyncStorage.clear();
  });

  it("keeps drafts per user and event until cleared", async () => {
    setDraft("u1", "e1", { a: red });
    expect(await loadDraft("u1", "e1")).toEqual({ a: red });
    expect(await loadDraft("u2", "e1")).toBeUndefined();
    clearDraft("u1", "e1");
    expect(await loadDraft("u1", "e1")).toBeUndefined();
  });

  it("survives the app closing, cleared pick included", async () => {
    setDraft("u1", "e1", { b: blueKo });
    resetDraftCache();
    const draft = await loadDraft("u1", "e1");
    expect(draft).toEqual({ b: blueKo });
    // Merged with a saved card that still has the cleared pick, it stays cleared.
    expect(withDraft({ a: red, b: blueKo }, draft, ["a", "b"])).toEqual({ b: blueKo });
  });

  it("keeps new picks that weren't locked in after the app closes", async () => {
    setDraft("u1", "e1", { a: red, b: blueKo });
    resetDraftCache();
    const draft = await loadDraft("u1", "e1");
    // Nothing saved on the server yet: the card is the draft.
    expect(withDraft({}, draft, ["a", "b"])).toEqual({ a: red, b: blueKo });
  });

  it("keeps a mix of new, switched and cleared picks after the app closes", async () => {
    const switched = { ...red, corner: "blue" as const };
    // Saved: a and b. Edited: a switched, b cleared, c added.
    setDraft("u1", "e1", { a: switched, c: red });
    resetDraftCache();
    const draft = await loadDraft("u1", "e1");
    expect(withDraft({ a: red, b: blueKo }, draft, ["a", "b", "c"])).toEqual({ a: switched, c: red });
  });

  it("keeps every pick cleared after the app closes", async () => {
    setDraft("u1", "e1", {});
    resetDraftCache();
    const draft = await loadDraft("u1", "e1");
    expect(draft).toEqual({});
    expect(withDraft({ a: red, b: blueKo }, draft, ["a", "b"])).toEqual({});
  });

  it("is gone after lock-in, even after the app closes", async () => {
    setDraft("u1", "e1", { a: red });
    clearDraft("u1", "e1");
    resetDraftCache();
    expect(await loadDraft("u1", "e1")).toBeUndefined();
  });

  it("doesn't let a slow read bring back a draft cleared meanwhile", async () => {
    setDraft("u1", "e1", { a: red });
    resetDraftCache();
    const pending = loadDraft("u1", "e1");
    clearDraft("u1", "e1");
    expect(await pending).toBeUndefined();
  });

  it("treats an unreadable stored draft as none", async () => {
    await AsyncStorage.setItem("fnf.picks.draft.u1.e1", "{not json");
    expect(await loadDraft("u1", "e1")).toBeUndefined();
  });
});
