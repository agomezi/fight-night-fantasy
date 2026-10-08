// What the report email to the owner says. Pure and dependency-free, so the
// results sync imports it under Deno and jest tests it here.

/** One new report against the player. */
export type NewReport = {
  id: number;
  reportedName: string;
  reason: string | null;
  note: string | null;
  league: string | null;
  reporterId: string;
  reporterName: string | null;
  reporterAgeDays: number;
  reporterReports: number;
  reporterEstablished: boolean;
  reportedAt: string;
};

/** One reported player, as `claim_report_emails` returns it. */
export type ClaimedTarget = {
  reported_id: string;
  current_name: string | null;
  past_names: string[];
  protected: boolean;
  reporters: number;
  established: number;
  leagues: number;
  burst: boolean;
  reports: NewReport[];
};

/** Every subject starts with this, so the reports can be filtered. */
export const SUBJECT_TAG = "[REPORT-REVIEW]";

// Names and notes are typed by players: keep them to one line.
function oneLine(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function utc(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function reasonOf(r: NewReport): string {
  return r.reason ?? "no reason given";
}

function reporterLine(r: NewReport): string {
  const name = r.reporterName == null ? "(no name)" : oneLine(r.reporterName);
  const age = r.reporterAgeDays === 0 ? "made today" : `${plural(r.reporterAgeDays, "day")} old`;
  const standing = r.reporterEstablished ? "established" : "NEW ACCOUNT";
  return `${name} (${r.reporterId}): ${standing}, account ${age}, ${plural(r.reporterReports, "report")} filed`;
}

export function reportEmail(t: ClaimedTarget): { subject: string; text: string } {
  const latest = t.reports[t.reports.length - 1];
  const name = oneLine(t.current_name ?? latest.reportedName);
  const single = t.reports.length === 1;
  const reasons = [...new Set(t.reports.map(reasonOf))].join(", ");

  const what = single ? reasons : `${t.reports.length} new reports: ${reasons}`;
  const subject = `${SUBJECT_TAG}${t.burst ? " [BURST]" : ""} ${name} — ${what} (${plural(t.reporters, "reporter")})`;

  const reported = new Set(t.reports.map(r => r.reportedName));
  const past = t.past_names.filter(n => n !== t.current_name && !reported.has(n)).map(oneLine);
  const reportedNames = [...reported].filter(n => n !== t.current_name).map(oneLine);

  const lines = [
    single ? `${name} was reported for ${reasons}.` : `${name} has ${t.reports.length} new reports.`,
    "",
  ];
  if (t.burst) {
    lines.push(
      "Possible pile-on: three or more reports within the hour, or most reporters",
      "are new accounts. Check who is reporting before acting.",
      "",
    );
  }
  lines.push(
    `Player:        ${name} (${t.reported_id})`,
    `Current name:  ${t.current_name == null ? "(cleared)" : oneLine(t.current_name)}`,
    ...(reportedNames.length ? [`Reported as:   ${reportedNames.join(", ")}`] : []),
    `Past names:    ${past.length ? past.join(", ") : "(none)"}`,
    `Protected:     ${t.protected ? "yes (moderator), never hidden automatically" : "no"}`,
    `Reporters:     ${t.reporters} in total, ${t.established} established, from ${plural(t.leagues, "league")}`,
    "",
    single ? "The report:" : "New reports:",
  );
  t.reports.forEach((r, i) => {
    lines.push(
      `${single ? "" : `${i + 1}. `}${reasonOf(r)}, ${utc(r.reportedAt)}`,
      `   Note:     ${r.note == null ? "(none)" : `"${oneLine(r.note)}"`}`,
      `   League:   ${r.league == null ? "(none, from the leaderboard)" : oneLine(r.league)}`,
      `   Reporter: ${reporterLine(r)}`,
    );
  });
  lines.push(
    "",
    "Established: an account at least a week old with picks on a scored card.",
    "",
    "Clear their name (they pick a new one the next time they open the app):",
    `  select public.reset_display_name('${t.reported_id}');`,
    "",
    "Every report against them:",
    `  select * from public.reported_names where player = '${t.reported_id}';`,
    "",
  );

  return { subject, text: lines.join("\n") };
}
