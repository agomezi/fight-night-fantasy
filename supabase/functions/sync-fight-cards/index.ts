// Fight-card sync, run on a schedule by pg_cron (see the card_sync migration).
//
//   { "mode": "full" }  every announced upcoming card, discovered from UFC.com
//   { "mode": "soon" }  only cards already stored that start within a week
//
// Each card is read from the UFC stats feed, parsed, and written through
// `sync_event_card`. One card failing never stops the others.

import { createClient } from "npm:@supabase/supabase-js@2";
import { eventFmid, parseCard, upcomingEventSlugs } from "../../../services/ingestion/card.ts";

const UFC_SITE = "https://www.ufc.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const SOON = 7 * 24 * 60 * 60 * 1000;
// A card that started within the last day may still be running.
const RECENT = 24 * 60 * 60 * 1000;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.text();
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
  const { mode } = await request.json().catch(() => ({}));
  if (mode !== "full" && mode !== "soon") return new Response('Expected mode "full" or "soon"', { status: 400 });

  const feed = env("UFC_FEED_BASE_URL").replace(/\/+$/, "");
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const errors: { source: string; error: string }[] = [];
  const fail = (source: string, error: unknown) => errors.push({ source, error: error instanceof Error ? error.message : String(error) });

  // Cards already stored and still open. In full mode these are synced even
  // if they have left the listing, so a postponed card is not stranded.
  const now = Date.now();
  let stored = db.from("events").select("ufc_event_id").in("status", ["scheduled", "live"]).not("ufc_event_id", "is", null)
    .gte("starts_at", new Date(now - RECENT).toISOString());
  if (mode === "soon") stored = stored.lte("starts_at", new Date(now + SOON).toISOString());
  const { data: rows, error: storedError } = await stored;
  if (storedError) return Response.json({ error: storedError.message }, { status: 500 });
  const fmids = new Set(rows.map(r => r.ufc_event_id as string));

  // Listed on UFC.com but not yet in the feed; picked up once they are.
  const awaitingFeed: string[] = [];
  if (mode === "full") {
    let slugs: string[] = [];
    try {
      slugs = upcomingEventSlugs(await get(`${UFC_SITE}/events`));
    } catch (error) {
      fail("events listing", error);
    }
    let found = 0;
    for (const slug of slugs) {
      try {
        const fmid = eventFmid(await get(`${UFC_SITE}/event/${slug}`));
        if (fmid) {
          fmids.add(fmid);
          found++;
        } else {
          awaitingFeed.push(slug);
        }
      } catch (error) {
        fail(slug, error);
      }
    }
    // One card waiting is normal; every card waiting means the page changed.
    if (slugs.length && !found) fail("event pages", "No event page had a feed id");
  }

  const synced: unknown[] = [];
  for (const fmid of fmids) {
    try {
      const card = parseCard(JSON.parse(await get(`${feed}/${fmid}.json`)));
      if (!card) continue;
      const { data, error } = await db.rpc("sync_event_card", { card });
      if (error) throw new Error(error.message);
      synced.push({ fmid, name: card.name, ...data, ...(card.issues.length ? { issues: card.issues } : {}) });
    } catch (error) {
      fail(`event ${fmid}`, error);
    }
  }

  const { data: slotted, error: slotError } = await db.rpc("assign_season_slots");
  if (slotError) fail("season slots", slotError);

  const report = { mode, synced, awaitingFeed, slotted: slotted ?? 0, errors };
  console.log(JSON.stringify(report));
  return Response.json(report, { status: errors.length ? 207 : 200 });
});
