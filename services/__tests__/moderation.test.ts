import { availableActions, openFor, suggestion, toCase, toQueue } from "../moderation";
import { notificationHref } from "../inbox";
import { notificationText } from "../notificationText";

describe("moderation", () => {
  it("suggests the escalation policy's next step", () => {
    expect(suggestion(0)).toBe("Reset the name and warn");
    expect(suggestion(1)).toBe("Reset the name and suspend for 7 days");
    expect(suggestion(4)).toBe("Ban");
  });

  it("offers dismiss only on an open case, and lift only to a restricted player", () => {
    expect(availableActions({ status: "open", player: { standing: "active" } as never })).toEqual([
      "dismiss", "warn", "reset_name", "suspend", "ban",
    ]);
    expect(availableActions({ status: "actioned", player: { standing: "suspended" } as never })).toEqual([
      "warn", "reset_name", "suspend", "ban", "lift",
    ]);
    expect(availableActions({ status: "dismissed", player: { standing: "active" } as never })).toEqual([]);
  });

  it("says how long a case has been open", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(openFor(new Date("2026-10-08T11:55:00Z"), now)).toBe("5m");
    expect(openFor(new Date("2026-10-08T09:00:00Z"), now)).toBe("3h");
    expect(openFor(new Date("2026-10-06T12:00:00Z"), now)).toBe("2d");
  });

  it("shapes the queue and a case", () => {
    const [q] = toQueue([
      { case_id: 3, player: "p", name: null, reporters: 2, reasons: null, opened_at: "2026-10-08T00:00:00Z",
        strikes: 1, standing: "active", protected: false },
    ]);
    expect(q).toMatchObject({ caseId: 3, name: null, reasons: [] });
    expect(q.openedAt).toEqual(new Date("2026-10-08T00:00:00Z"));

    const c = toCase({
      id: 3, status: "open", openedAt: "2026-10-08T00:00:00Z", resolvedAt: null,
      player: { id: "p", name: "Cal", pastNames: null, standing: "suspended", until: "2026-10-15T00:00:00Z", strikes: 1, protected: false },
      reports: null,
      actions: [{ id: 1, caseId: 2, action: "suspend", reason: "Spam", note: null, expiresAt: "2026-10-15T00:00:00Z", moderator: null, at: "2026-10-08T00:00:00Z" }],
    });
    expect(c.player.until).toEqual(new Date("2026-10-15T00:00:00Z"));
    expect(c.player.pastNames).toEqual([]);
    expect(c.reports).toEqual([]);
    expect(c.actions[0]).toMatchObject({ action: "suspend", moderator: null });
  });

  it("words a case alert and opens the case when tapped", () => {
    const opened = notificationText("moderation_case", { caseId: 7, stage: "opened", name: "Cal", reason: "impersonation", reporters: 1 });
    expect(opened.title).toBe("New report: Cal");
    expect(opened.body).toBe("impersonation. Tap to review.");
    expect(notificationHref(opened.data)).toBe("/moderation-case?id=7");

    const three = notificationText("moderation_case", { caseId: 7, stage: "three", name: "Cal", reason: null, reporters: 3 });
    expect(three.title).toBe("Cal now has 3 reporters");
  });
});
