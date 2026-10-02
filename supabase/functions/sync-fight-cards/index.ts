// Fight-card sync, run on a schedule by pg_cron (see the card_sync migration).
//
//   { "mode": "full" }  every announced upcoming card, discovered from UFC.com
//   { "mode": "soon" }  only cards already stored that start within a week
//
// Each card is read from the UFC stats feed, parsed, and written through
// `sync_event_card`. One card failing never stops the others.
//
// A full sync also fills in fighter photos from API-Sports when
// APISPORTS_KEY is set: one request per card date, only for cards with a
// fighter still missing one, and each fighter is matched once.

import { createClient } from "npm:@supabase/supabase-js@2";
import { eventFmid, parseCard, upcomingEventSlugs, type IngestedCard } from "../../../services/ingestion/card.ts";
import { matchPhotos } from "../../../services/ingestion/photos.ts";

const UFC_SITE = "https://www.ufc.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const SOON = 7 * 24 * 60 * 60 * 1000;
// A card that started within the last day may still be running.
const RECENT = 24 * 60 * 60 * 1000;
const APISPORTS = "https://v1.mma.api-sports.io";
// The free plan allows 100 requests a day; a full sync stays well inside it.
const PHOTO_REQUEST_BUDGET = 20;

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
  const cards: IngestedCard[] = [];
  for (const fmid of fmids) {
    try {
      const card = parseCard(JSON.parse(await get(`${feed}/${fmid}.json`)));
      if (!card) continue;
      cards.push(card);
      const { data, error } = await db.rpc("sync_event_card", { card });
      if (error) throw new Error(error.message);
      synced.push({ fmid, name: card.name, ...data, ...(card.issues.length ? { issues: card.issues } : {}) });
    } catch (error) {
      fail(`event ${fmid}`, error);
    }
  }

  const { data: slotted, error: slotError } = await db.rpc("assign_season_slots");
  if (slotError) fail("season slots", slotError);

  const apisportsKey = Deno.env.get("APISPORTS_KEY");
  let photos: number | string = "skipped";
  if (mode === "full" && apisportsKey) {
    try {
      photos = await syncPhotos(db, apisportsKey, cards, fail);
    } catch (error) {
      fail("photos", error);
    }
  }

  const report = { mode, synced, awaitingFeed, slotted: slotted ?? 0, photos, errors };
  console.log(JSON.stringify(report));
  return Response.json(report, { status: errors.length ? 207 : 200 });
});

type Db = ReturnType<typeof createClient>;

/** A bad key or a spent quota: every further request would fail the same way. */
class ApiSportsUnavailable extends Error {}

async function apisports(key: string, path: string): Promise<unknown> {
  const response = await fetch(`${APISPORTS}/${path}`, { headers: { "x-apisports-key": key }, signal: AbortSignal.timeout(30_000) });
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new ApiSportsUnavailable(`HTTP ${response.status} from API-Sports (check the key and daily quota)`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from API-Sports`);
  const payload = await response.json();
  // API-Sports reports bad keys and exhausted quotas in `errors` with a 200.
  const apiErrors = (payload as { errors?: unknown }).errors;
  if (apiErrors && (Array.isArray(apiErrors) ? apiErrors.length : Object.keys(apiErrors).length)) {
    const message = `API-Sports: ${JSON.stringify(apiErrors)}`;
    // Key and quota problems come back as `token` / `requests` errors.
    throw /token|requests|access/i.test(JSON.stringify(apiErrors)) ? new ApiSportsUnavailable(message) : new Error(message);
  }
  return payload;
}

/** Fills in photos for fighters on these cards who have none yet. Returns how many were set. */
async function syncPhotos(db: Db, key: string, cards: IngestedCard[], fail: (source: string, error: unknown) => void) {
  const ids = [...new Set(cards.flatMap(c => c.bouts.flatMap(b => [b.red.ufcFighterId, b.blue.ufcFighterId])))];
  if (!ids.length) return 0;
  const { data, error } = await db.from("fighters").select("ufc_fighter_id").in("ufc_fighter_id", ids).is("photo_url", null);
  if (error) throw new Error(error.message);
  const missing = new Set((data ?? []).map(r => r.ufc_fighter_id as string));

  let requests = 0;
  let set = 0;
  for (const card of cards) {
    const bouts = card.bouts.filter(b => missing.has(b.red.ufcFighterId) || missing.has(b.blue.ufcFighterId));
    if (!bouts.length) continue;
    // A card runs across midnight UTC, so API-Sports may file it under either date.
    const start = new Date(card.startsAt);
    const dates = [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)].map(d => d.toISOString().slice(0, 10));
    const response: unknown[] = [];
    for (const date of dates) {
      if (requests >= PHOTO_REQUEST_BUDGET) return set;
      requests++;
      try {
        const payload = await apisports(key, `fights?date=${date}`);
        response.push(...(((payload as { response?: unknown[] }).response) ?? []));
      } catch (error) {
        fail(`photos ${card.name} ${date}`, error);
        if (error instanceof ApiSportsUnavailable) return set;
      }
    }
    const matches = matchPhotos(bouts, { response }).filter(m => missing.has(m.ufcFighterId));
    if (!matches.length) continue;
    const { data: count, error: setError } = await db.rpc("set_fighter_photos", { photos: matches });
    if (setError) fail(`photos ${card.name}`, setError.message);
    else set += count as number;
  }
  return set;
}
