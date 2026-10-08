// Emailing new reports to the owner through Resend. Needs two secrets, set
// with `npx supabase secrets set`: RESEND_API_KEY, and MODERATION_EMAIL, the
// address reports go to. Without a verified domain Resend's shared sender
// only delivers to the account's own address, which is all this needs.

import { reportEmail, type ClaimedReport } from "../../../services/reportEmail.ts";

const RESEND = "https://api.resend.com/emails";
const FROM = "Fight Night Fantasy <onboarding@resend.dev>";
// Resend allows two requests a second.
const SPACING_MS = 600;

type Db = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Claims every report not yet emailed and sends one email for each. Anything
 * that couldn't be sent is released for the next run. Never throws. */
export async function emailReports(db: Db) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("MODERATION_EMAIL");
  // Leave reports unclaimed until the secrets are set, so none are lost.
  if (!apiKey || !to) return { skipped: "RESEND_API_KEY or MODERATION_EMAIL is not set" };

  const { data, error } = await db.rpc("claim_report_emails");
  if (error) return { error: error.message };
  const reports = (data ?? []) as ClaimedReport[];

  let sent = 0;
  let failure: string | undefined;
  for (const [i, report] of reports.entries()) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, SPACING_MS));
    try {
      const { subject, text } = reportEmail(report);
      const response = await fetch(RESEND, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [to], subject, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from Resend: ${await response.text()}`);
      sent += 1;
    } catch (e) {
      // Stop here: whatever failed this one will most likely fail the rest.
      failure = e instanceof Error ? e.message : String(e);
      break;
    }
  }

  const unsent = reports.slice(sent).map(r => r.report_id);
  if (unsent.length) {
    const { error: releaseError } = await db.rpc("release_report_emails", { report_ids: unsent });
    if (releaseError) failure = `${failure}; release failed: ${releaseError.message}`;
  }
  return { claimed: reports.length, sent, ...(failure ? { error: failure } : {}) };
}
