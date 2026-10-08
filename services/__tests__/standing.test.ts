import { SUPPORT_EMAIL } from "../notificationText";
import { ACTIVE, BANNED_MESSAGE, signInError, suspendedBanner, suspendedReason } from "../standing";

const suspended = { standing: "suspended" as const, until: new Date("2026-10-15T04:00:00Z") };

describe("standing", () => {
  it("shows a banner only while suspended", () => {
    expect(suspendedBanner(ACTIVE)).toBeNull();
    expect(suspendedBanner(suspended)).toBe("Suspended until Oct 15");
    expect(suspendedBanner({ standing: "suspended", until: null })).toBe("Suspended");
  });

  it("explains what a suspended player can't do", () => {
    expect(suspendedReason(ACTIVE)).toBeNull();
    expect(suspendedReason(suspended)).toBe(
      "Your account is suspended until Oct 15. You can look around, but can't make picks, join or create leagues, or report players until then."
    );
  });

  it("says plainly that a banned account can't sign in", () => {
    expect(signInError("User is banned")).toEqual({ title: "Account banned", message: BANNED_MESSAGE });
    expect(BANNED_MESSAGE).toContain(SUPPORT_EMAIL);
    expect(signInError("Network request failed")).toEqual({ title: "Sign in failed", message: "Network request failed" });
  });
});
