import { whatsNewToShow, type WhatsNewEntry } from "../../constants/whatsNew";

const entries: WhatsNewEntry[] = [
  { id: "b", date: "2026-10-19T00:00:00Z", title: "B", items: [] },
  { id: "a", date: "2026-10-01T00:00:00Z", title: "A", items: [] },
];

describe("whatsNewToShow", () => {
  it("shows the newest entry to an account that hasn't closed it", () => {
    expect(whatsNewToShow(null, "2026-09-01T00:00:00Z", entries)?.id).toBe("b");
    expect(whatsNewToShow("a", "2026-09-01T00:00:00Z", entries)?.id).toBe("b");
  });

  it("shows it once", () => {
    expect(whatsNewToShow("b", "2026-09-01T00:00:00Z", entries)).toBeNull();
  });

  it("skips accounts made after it, who never knew the old way", () => {
    expect(whatsNewToShow(null, "2026-10-20T00:00:00Z", entries)).toBeNull();
  });

  it("shows nothing with no entries", () => {
    expect(whatsNewToShow(null, null, [])).toBeNull();
  });
});
