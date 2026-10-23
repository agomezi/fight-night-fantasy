import { newerSeen, seenToSave, whatsNewToShow, type WhatsNewEntry } from "../../constants/whatsNew";

const entries: WhatsNewEntry[] = [
  { id: "d", date: "2026-10-22T00:00:00Z", title: "D", items: [] },
  { id: "c", date: "2026-10-20T00:00:00Z", title: "C", items: [] },
  { id: "b", date: "2026-10-19T00:00:00Z", title: "B", items: [] },
  { id: "a", date: "2026-10-01T00:00:00Z", title: "A", items: [] },
];

describe("whatsNewToShow", () => {
  const ids = (seen: string | null, made: string | null, cap = 10) =>
    whatsNewToShow(seen, made, entries, cap).show.map((e) => e.id);

  it("shows every entry an account hasn't seen, newest first", () => {
    expect(ids(null, "2026-09-01T00:00:00Z")).toEqual(["d", "c", "b", "a"]);
    expect(ids("b", "2026-09-01T00:00:00Z")).toEqual(["d", "c"]);
  });

  it("shows them once", () => {
    expect(whatsNewToShow("d", "2026-09-01T00:00:00Z", entries)).toEqual({ show: [], missed: 0 });
  });

  it("skips entries from before the account was made", () => {
    expect(ids(null, "2026-10-05T00:00:00Z")).toEqual(["d", "c", "b"]);
    expect(ids(null, "2026-10-23T00:00:00Z")).toEqual([]);
  });

  it("caps the card at the newest few and counts the rest", () => {
    expect(whatsNewToShow("a", "2026-09-01T00:00:00Z", entries, 2)).toEqual({
      show: [entries[0], entries[1]],
      missed: 1,
    });
    expect(whatsNewToShow("b", "2026-09-01T00:00:00Z", entries, 2).missed).toBe(0);
  });

  it("shows nothing with no entries", () => {
    expect(whatsNewToShow(null, null, [])).toEqual({ show: [], missed: 0 });
  });
});

describe("newerSeen", () => {
  it("picks whichever is higher in the list", () => {
    expect(newerSeen("b", "d", entries)).toBe("d");
    expect(newerSeen("d", "b", entries)).toBe("d");
  });

  it("ignores ids it doesn't know", () => {
    expect(newerSeen("zzz", "b", entries)).toBe("b");
    expect(newerSeen(null, undefined, entries)).toBeNull();
    expect(newerSeen("zzz", null, entries)).toBeNull();
  });
});

describe("seenToSave", () => {
  it("moves the account forward", () => {
    expect(seenToSave(null, "b", entries)).toBe("b");
    expect(seenToSave("b", "d", entries)).toBe("d");
  });

  it("never moves it back or rewrites the same id", () => {
    expect(seenToSave("d", "b", entries)).toBeNull();
    expect(seenToSave("d", "d", entries)).toBeNull();
    expect(seenToSave("b", null, entries)).toBeNull();
  });

  it("leaves an id from a newer build alone", () => {
    expect(seenToSave("from-a-newer-build", "d", entries)).toBeNull();
  });
});
