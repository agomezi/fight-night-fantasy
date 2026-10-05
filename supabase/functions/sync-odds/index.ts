// Odds sync, run by pg_cron when `odds_sync_due` says a run is due (see the
// bout_odds migration).
//
// One request to The Odds API prices every MMA fight it lists. Each bout still
// open to picks is matched by its pair of fighters on the card's date, and its
// consensus moneyline and underdog are written through `record_odds`, which
// skips any bout that has locked. Bouts that cannot be matched keep no
// underdog, so a missing line never awards the bonus.
//
// Needs ODDS_API_KEY. The free plan allows 500 requests a month; each run's
// remaining allowance is logged in `odds_syncs`.

import { createClient } from "npm:@supabase/supabase-js@2";
import { matchOdds, type OddsBout } from "../../../services/ingestion/odds.ts";

// Overridable only so the function can be tested against a local mock.
const ODDS_API = (Deno.env.get("ODDS_API_BASE_URL") ?? "https://api.the-odds-api.com").replace(/\/+$/, "");

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Constant-time, so the secret cannot be guessed a byte at a time.
function sameSecret(given: string | null, expected: string): boolean {
  if (given == null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!sameSecret(request.headers.get("x-card-sync-secret"), env("CARD_SYNC_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: rows, error: boutsError } = await db.rpc("bouts_for_odds");
  if (boutsError) return Response.json({ error: boutsError.message }, { status: 500 });
  const bouts: OddsBout[] = (rows as { bout_id: string; starts_at: string; red: string; blue: string }[]).map(r => ({
    boutId: r.bout_id,
    startsAt: r.starts_at,
    red: r.red,
    blue: r.blue,
  }));
  if (!bouts.length) return Response.json({ bouts: 0 });

  // Logged even when the request fails, so a broken key or an outage is not
  // retried every few minutes.
  let report: Record<string, unknown> = { bouts: bouts.length };
  let odds: unknown[] = [];
  let creditsRemaining: number | null = null;
  try {
    const key = env("ODDS_API_KEY");
    const url = `${ODDS_API}/v4/sports/mma_mixed_martial_arts/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const remaining = Number(response.headers.get("x-requests-remaining"));
    if (response.headers.has("x-requests-remaining") && Number.isFinite(remaining)) creditsRemaining = remaining;
    if (!response.ok) throw new Error(`HTTP ${response.status} from The Odds API`);
    const match = matchOdds(bouts, await response.json());
    odds = match.odds;
    report = { ...report, matched: match.odds.length, unmatched: match.unmatched, noLines: match.noLines };
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  const { data: updated, error: recordError } = await db.rpc("record_odds", { odds, report, credits_remaining: creditsRemaining });
  if (recordError) report.recordError = recordError.message;
  const result = { ...report, updated: updated ?? 0, creditsRemaining };
  console.log(JSON.stringify(result));
  return Response.json(result, { status: report.error || recordError ? 207 : 200 });
});
