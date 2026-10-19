import { whatsNewToShow, type WhatsNewEntry } from "../../constants/whatsNew";

const entries: WhatsNewEntry[] = [
  { id: "b", date: "2026-10-19T00:00:00Z", title: "B", items: [] },
  { id: "a", date: "2026-10-01T00:00:00Z", title: "A", items: [] },
];

describe("whatsNewToShow", () => {
  const ids = (list: WhatsNewEntry[]) => list.map((e) => e.id);

  it("shows every entry an account hasn't seen, newest first", () => {
    expect(ids(whatsNewToShow(null, "2026-09-01T00:00:00Z", entries))).toEqual(["b", "a"]);
    expect(ids(whatsNewToShow("a", "2026-09-01T00:00:00Z", entries))).toEqual(["b"]);
  });

  it("shows them once", () => {
    expect(whatsNewToShow("b", "2026-09-01T00:00:00Z", entries)).toEqual([]);
  });

  it("skips entries from before the account was made", () => {
    expect(ids(whatsNewToShow(null, "2026-10-05T00:00:00Z", entries))).toEqual(["b"]);
    expect(whatsNewToShow(null, "2026-10-20T00:00:00Z", entries)).toEqual([]);
  });

  it("shows nothing with no entries", () => {
    expect(whatsNewToShow(null, null, [])).toEqual([]);
  });
});
