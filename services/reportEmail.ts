// What the report email to the owner says. Pure and dependency-free, so the
// results sync imports it under Deno and jest tests it here.

/** One claimed report, as `claim_report_emails` returns it. */
export type ClaimedReport = {
  report_id: number;
  reported_id: string;
  reported_name: string;
  current_name: string | null;
  past_names: string[];
  reason: string | null;
  note: string | null;
  league: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reported_at: string;
  reporters: number;
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

export function reportEmail(r: ClaimedReport): { subject: string; text: string } {
  const name = oneLine(r.reported_name);
  const reason = r.reason ?? "no reason given";
  const reporters = `${r.reporters} ${r.reporters === 1 ? "reporter" : "reporters"}`;
  const subject = `${SUBJECT_TAG} ${name} — ${reason} (${reporters})`;

  const current = r.current_name == null ? "(cleared)" : oneLine(r.current_name);
  const past = r.past_names.filter(n => n !== r.reported_name).map(oneLine);
  const note = r.note == null ? "(none)" : `"${oneLine(r.note)}"`;
  const reporter = `${r.reporter_name == null ? "(no name)" : oneLine(r.reporter_name)} (${r.reporter_id})`;
  const others = r.reporters - 1;

  const text = [
    `${name} was reported for ${reason}.`,
    "",
    `Reported name: ${name}`,
    `Current name:  ${current}`,
    `Past names:    ${past.length ? past.join(", ") : "(none)"}`,
    `Reason:        ${reason}`,
    `Note:          ${note}`,
    `League:        ${r.league == null ? "(none)" : oneLine(r.league)}`,
    `Reporter:      ${reporter}`,
    `Reported at:   ${utc(r.reported_at)}`,
    `Reporters:     ${r.reporters}${others > 0 ? ` (${others} before this one)` : " (the first)"}`,
    `Player id:     ${r.reported_id}`,
    "",
    "Clear their name (they pick a new one the next time they open the app):",
    `  select public.reset_display_name('${r.reported_id}');`,
    "",
    "Every report against them:",
    `  select * from public.reported_names where player = '${r.reported_id}';`,
    "",
  ].join("\n");

  return { subject, text };
}
