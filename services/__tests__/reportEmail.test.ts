import { reportEmail, SUBJECT_TAG, type ClaimedTarget, type NewReport } from "../reportEmail";

const PLAYER = "00000000-0000-0000-0000-000000000003";

const ana: NewReport = {
  id: 7,
  reportedName: "Ben",
  reason: "impersonation",
  note: "Says he's me",
  league: "Weekend Warriors",
  reporterId: "00000000-0000-0000-0000-000000000001",
  reporterName: "Ana",
  reporterAgeDays: 40,
  reporterReports: 1,
  reporterEstablished: true,
  reportedAt: "2026-10-07T21:14:09.123Z",
};

const target: ClaimedTarget = {
  reported_id: PLAYER,
  case_id: 12,
  current_name: "Ben",
  past_names: ["Benny"],
  protected: false,
  reporters: 2,
  established: 2,
  leagues: 1,
  burst: false,
  strikes: 0,
  standing: "active",
  reports: [ana],
};

describe("reportEmail", () => {
  it("tags the subject so it can be filtered", () => {
    expect(reportEmail(target).subject).toBe(`${SUBJECT_TAG} Ben — impersonation (2 reporters)`);
    expect(reportEmail({ ...target, reporters: 1 }).subject).toBe("[REPORT-REVIEW] Ben — impersonation (1 reporter)");
  });

  it("carries everything needed to review the report", () => {
    const { text } = reportEmail(target);
    expect(text).toContain(`Player:        Ben (${PLAYER})`);
    expect(text).toContain("Past names:    Benny");
    expect(text).toContain("Protected:     no");
    expect(text).toContain("Reporters:     2 in total, 2 established, from 1 league");
    expect(text).toContain("impersonation, 2026-10-07 21:14 UTC");
    expect(text).toContain(`   Note:     "Says he's me"`);
    expect(text).toContain("   League:   Weekend Warriors");
    expect(text).toContain(
      "   Reporter: Ana (00000000-0000-0000-0000-000000000001): established, account 40 days old, 1 report filed"
    );
  });

  it("includes SQL ready to run on the case", () => {
    const { text } = reportEmail(target);
    expect(text).toContain("Case:          12");
    expect(text).toContain("select * from public.moderate(12, 'dismiss');");
    expect(text).toContain("select * from public.moderate(12, 'reset_name', 'Offensive name');");
    expect(text).toContain("select * from public.moderate(12, 'suspend', 'Offensive name', null, interval '7 days');");
    expect(text).not.toContain("'lift'");
    expect(text).toContain(`select * from public.reported_names where player = '${PLAYER}';`);
  });

  it("suggests the next step from the player's strikes", () => {
    expect(reportEmail(target).text).toContain("Standing:      active, 0 strikes (suggested: reset the name and warn)");
    expect(reportEmail({ ...target, strikes: 1 }).text).toContain("1 strike (suggested: reset the name and suspend for 7 days)");
    const { text } = reportEmail({ ...target, strikes: 2, standing: "suspended" });
    expect(text).toContain("Standing:      suspended, 2 strikes (suggested: ban)");
    expect(text).toContain("select * from public.moderate(12, 'lift', 'Appeal accepted');");
  });

  it("gathers several reports into one email", () => {
    const sam: NewReport = {
      ...ana, id: 8, reason: "offensive name", note: null, reporterName: "Sam", reporterAgeDays: 0,
      reporterReports: 5, reporterEstablished: false,
    };
    const { subject, text } = reportEmail({ ...target, reporters: 3, established: 2, reports: [ana, sam] });
    expect(subject).toBe("[REPORT-REVIEW] Ben — 2 new reports: impersonation, offensive name (3 reporters)");
    expect(text).toContain("Ben has 2 new reports.");
    expect(text).toContain("1. impersonation");
    expect(text).toContain("2. offensive name");
    expect(text).toContain("Sam (00000000-0000-0000-0000-000000000001): NEW ACCOUNT, account made today, 5 reports filed");
  });

  it("marks a pile-on and a protected player", () => {
    const { subject, text } = reportEmail({ ...target, burst: true, protected: true });
    expect(subject).toBe("[REPORT-REVIEW] [BURST] Ben — impersonation (2 reporters)");
    expect(text).toContain("Possible pile-on");
    expect(text).toContain("Protected:     yes (moderator), never hidden automatically");
  });

  it("shows the name that was reported when it has changed since", () => {
    const { subject, text } = reportEmail({ ...target, current_name: "Benjamin", past_names: ["Ben", "Benny"] });
    expect(subject).toContain("Benjamin —");
    expect(text).toContain("Reported as:   Ben");
    expect(text).toContain("Past names:    Benny");
  });

  it("fills in what's missing", () => {
    const { subject, text } = reportEmail({
      ...target,
      current_name: null,
      past_names: [],
      reporters: 1,
      reports: [{ ...ana, reason: null, note: null, league: null, reporterName: null }],
    });
    expect(subject).toBe("[REPORT-REVIEW] Ben — no reason given (1 reporter)");
    expect(text).toContain("Current name:  (cleared)");
    expect(text).toContain("Past names:    (none)");
    expect(text).toContain("   Note:     (none)");
    expect(text).toContain("   League:   (none, from the leaderboard)");
    expect(text).toContain("   Reporter: (no name) (");
  });

  it("keeps player-typed text to one line", () => {
    const { subject, text } = reportEmail({
      ...target, current_name: "Ben\r\nBcc: x", reports: [{ ...ana, note: "line one\nline two" }],
    });
    expect(subject).toBe("[REPORT-REVIEW] Ben Bcc: x — impersonation (2 reporters)");
    expect(text).toContain(`"line one line two"`);
  });
});
