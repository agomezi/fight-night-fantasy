import { reportEmail, SUBJECT_TAG, type ClaimedReport } from "../reportEmail";

const report: ClaimedReport = {
  report_id: 7,
  reported_id: "00000000-0000-0000-0000-000000000003",
  reported_name: "Ben",
  current_name: "Ben",
  past_names: ["Benny", "Ben"],
  reason: "impersonation",
  note: "Says he's me",
  league: "Weekend Warriors",
  reporter_id: "00000000-0000-0000-0000-000000000001",
  reporter_name: "Ana",
  reported_at: "2026-10-07T21:14:09.123Z",
  reporters: 2,
};

describe("reportEmail", () => {
  it("tags the subject so it can be filtered", () => {
    expect(reportEmail(report).subject).toBe(`${SUBJECT_TAG} Ben — impersonation (2 reporters)`);
    expect(reportEmail({ ...report, reporters: 1 }).subject).toBe("[REPORT-REVIEW] Ben — impersonation (1 reporter)");
  });

  it("carries everything needed to review the report", () => {
    const { text } = reportEmail(report);
    expect(text).toContain("Current name:  Ben");
    expect(text).toContain("Past names:    Benny");
    expect(text).not.toContain("Benny, Ben");
    expect(text).toContain(`Note:          "Says he's me"`);
    expect(text).toContain("League:        Weekend Warriors");
    expect(text).toContain("Reporter:      Ana (00000000-0000-0000-0000-000000000001)");
    expect(text).toContain("Reported at:   2026-10-07 21:14 UTC");
    expect(text).toContain("Reporters:     2 (1 before this one)");
  });

  it("includes SQL ready to run against the reported player", () => {
    const { text } = reportEmail(report);
    expect(text).toContain("select public.reset_display_name('00000000-0000-0000-0000-000000000003');");
    expect(text).toContain("select * from public.reported_names where player = '00000000-0000-0000-0000-000000000003';");
  });

  it("fills in what's missing", () => {
    const { subject, text } = reportEmail({
      ...report, reason: null, note: null, league: null, current_name: null, past_names: [], reporter_name: null, reporters: 1,
    });
    expect(subject).toBe("[REPORT-REVIEW] Ben — no reason given (1 reporter)");
    expect(text).toContain("Current name:  (cleared)");
    expect(text).toContain("Past names:    (none)");
    expect(text).toContain("Note:          (none)");
    expect(text).toContain("League:        (none)");
    expect(text).toContain("Reporter:      (no name) (");
    expect(text).toContain("Reporters:     1 (the first)");
  });

  it("keeps player-typed text to one line", () => {
    const { subject, text } = reportEmail({ ...report, reported_name: "Ben\r\nBcc: x", note: "line one\nline two" });
    expect(subject).toBe("[REPORT-REVIEW] Ben Bcc: x — impersonation (2 reporters)");
    expect(text).toContain(`Note:          "line one line two"`);
  });
});
