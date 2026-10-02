// Fight-card sync, run on a schedule by pg_cron (see the card_sync migration).
//
//   { "mode": "full" }    every announced upcoming card, discovered from UFC.com
//   { "mode": "soon" }    only cards already stored that start within a week
//   { "mode": "photos" }  fighter photos for stored cards, from API-Sports
//
// Each card is read from the UFC stats feed, parsed, and written through
// `sync_event_card`. One card failing never stops the others.
//
// Photos need APISPORTS_KEY. They are matched first by card date, both
// fighters of a bout together, then by name for anyone still missing, and
// each fighter is matched once. The free plan allows 10 requests a minute and
// 100 a day, so photo runs are spaced out, capped, and kept off the card sync.

import { createClient } from "npm:@supabase/supabase-js@2";
import { eventFmid, parseCard, upcomingEventSlugs } from "../../../services/ingestion/card.ts";
import { matchByName, matchPhotos, searchTerm, type PhotoMatch } from "../../../services/ingestion/photos.ts";

const UFC_SITE = "https://www.ufc.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const SOON = 7 * 24 * 60 * 60 * 1000;
// A card that started within the last day may still be running.
const RECENT = 24 * 60 * 60 * 1000;
// Overridable only so the photo step can be tested against a local mock.
const APISPORTS = (Deno.env.get("APISPORTS_BASE_URL") ?? "https://v1.mma.api-sports.io").replace(/\/+$/, "");
// Free plan: 10 requests a minute, 100 a day. Photo runs are every 4 hours,
// so 6 a day at this cap stays under the daily limit, and requests are spaced
// to stay under the per-minute one. 15 spaced requests take about 105 seconds.
const PHOTO_REQUEST_BUDGET = 15;
const PHOTO_REQUEST_SPACING_MS = 7_000;
const DAY = 24 * 60 * 60 * 1000;

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
  if (mode !== "full" && mode !== "soon" && mode !== "photos") {
    return new Response('Expected mode "full", "soon" or "photos"', { status: 400 });
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const errors: { source: string; error: string }[] = [];
  const fail = (source: string, error: unknown) => errors.push({ source, error: error instanceof Error ? error.message : String(error) });

  if (mode === "photos") {
    const apisportsKey = Deno.env.get("APISPORTS_KEY");
    let photos: PhotoReport | "skipped" = "skipped";
    if (apisportsKey) {
      try {
        // The free plan only serves fights from yesterday to tomorrow;
        // APISPORTS_PLAN=paid lifts the window.
        photos = await syncPhotos(db, apisportsKey, Deno.env.get("APISPORTS_PLAN") === "paid", await storedCards(db), fail);
      } catch (error) {
        fail("photos", error);
      }
    }
    const report = { mode, photos, errors };
    console.log(JSON.stringify(report));
    return Response.json(report, { status: errors.length ? 207 : 200 });
  }

  const feed = env("UFC_FEED_BASE_URL").replace(/\/+$/, "");

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

type Db = ReturnType<typeof createClient>;

/** A bad key or a spent quota: every further request would fail the same way. */
class ApiSportsUnavailable extends Error {}
/** The plan does not serve this date; later runs will reach it. */
class ApiSportsDateOutOfPlan extends Error {}

/** The card fields the photo step reads, loaded from our own tables. */
type PhotoCard = {
  name: string;
  startsAt: string;
  bouts: {
    ufcFightId: string;
    weightClass: string | null;
    red: { ufcFighterId: string; name: string };
    blue: { ufcFighterId: string; name: string };
  }[];
};

/** Upcoming and running cards as stored, so a photo run never touches the UFC feed. */
async function storedCards(db: Db): Promise<PhotoCard[]> {
  const { data, error } = await db
    .from("events")
    .select(`name, starts_at, bouts ( ufc_fight_id, weight_class, status,
      red:fighters!bouts_red_fighter_id_fkey ( ufc_fighter_id, name ),
      blue:fighters!bouts_blue_fighter_id_fkey ( ufc_fighter_id, name ) )`)
    .in("status", ["scheduled", "live"])
    .gte("starts_at", new Date(Date.now() - RECENT).toISOString());
  if (error) throw new Error(error.message);
  type Fighter = { ufc_fighter_id: string | null; name: string };
  type Row = {
    name: string;
    starts_at: string;
    bouts: { ufc_fight_id: string | null; weight_class: string | null; status: string; red: Fighter; blue: Fighter }[];
  };
  return ((data ?? []) as unknown as Row[]).map(e => ({
    name: e.name,
    startsAt: new Date(e.starts_at).toISOString(),
    bouts: e.bouts
      .filter(b => b.status === "scheduled" && b.ufc_fight_id && b.red.ufc_fighter_id && b.blue.ufc_fighter_id)
      .map(b => ({
        ufcFightId: b.ufc_fight_id!,
        weightClass: b.weight_class,
        red: { ufcFighterId: b.red.ufc_fighter_id!, name: b.red.name },
        blue: { ufcFighterId: b.blue.ufc_fighter_id!, name: b.blue.name },
      })),
  }));
}

type PhotoReport = {
  set: number;
  /** API-Sports fights received, and card bouts matched to one. */
  fetchedFights: number;
  matchedBouts: number;
  /** Card dates outside the plan's window, left for a later run. */
  deferredDates: number;
  /** Fallback lookups by name, and fighters matched that way. */
  nameSearches: number;
  nameMatched: number;
  /** Searched by name without a match; skipped for a week. */
  notFound?: number;
  /** Field names on one API-Sports fighter, to confirm where the photo is. */
  sampleFighterFields?: string[];
};

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
    const text = JSON.stringify(apiErrors);
    // A `plan` error refuses one date. Key, quota and rate problems come back
    // as `token`, `requests` or `rateLimit` errors and would refuse everything.
    if (/"plan"/i.test(text)) throw new ApiSportsDateOutOfPlan(message);
    throw /token|requests|ratelimit/i.test(text) ? new ApiSportsUnavailable(message) : new Error(message);
  }
  return payload;
}

/** Fills in photos for fighters on these cards who have none yet. */
async function syncPhotos(
  db: Db,
  key: string,
  paidPlan: boolean,
  cards: PhotoCard[],
  fail: (source: string, error: unknown) => void,
): Promise<PhotoReport> {
  const report: PhotoReport = { set: 0, fetchedFights: 0, matchedBouts: 0, deferredDates: 0, nameSearches: 0, nameMatched: 0 };
  const ids = [...new Set(cards.flatMap(c => c.bouts.flatMap(b => [b.red.ufcFighterId, b.blue.ufcFighterId])))];
  if (!ids.length) return report;
  // Skip fighters a name search failed to find in the last week; debut
  // fighters are often not in API-Sports yet, and re-searching them every
  // run would spend the budget before later cards are reached.
  const recheckAfter = new Date(Date.now() - 7 * DAY).toISOString();
  const { data, error } = await db.from("fighters").select("ufc_fighter_id").in("ufc_fighter_id", ids).is("photo_url", null)
    .or(`photo_checked_at.is.null,photo_checked_at.lt.${recheckAfter}`);
  if (error) throw new Error(error.message);
  const missing = new Set((data ?? []).map(r => r.ufc_fighter_id as string));

  let requests = 0;
  let stopped = false;
  // One request, within budget and spaced under the per-minute limit.
  // Returns null when it should not or could not be made.
  const request = async (path: string, source: string): Promise<unknown | null> => {
    if (stopped || requests >= PHOTO_REQUEST_BUDGET) return null;
    if (requests > 0) await new Promise(resolve => setTimeout(resolve, PHOTO_REQUEST_SPACING_MS));
    requests++;
    try {
      return await apisports(key, path);
    } catch (error) {
      if (error instanceof ApiSportsDateOutOfPlan) {
        report.deferredDates++;
        return null;
      }
      fail(source, error);
      if (error instanceof ApiSportsUnavailable) stopped = true;
      return null;
    }
  };
  const save = async (matches: PhotoMatch[], source: string) => {
    if (!matches.length) return;
    const { data: count, error: setError } = await db.rpc("set_fighter_photos", { photos: matches });
    if (setError) return fail(source, setError.message);
    report.set += count as number;
    for (const m of matches) missing.delete(m.ufcFighterId);
  };

  // Nearest card first, so a tight budget is spent on the card people are
  // picking now.
  const byDate = [...cards].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = Date.now();
  const inPlan = (date: string) => paidPlan || Math.abs(Date.parse(`${date}T12:00:00Z`) - today) <= 1.5 * DAY;

  // 1. By card date: both fighters of a bout must match.
  for (const card of byDate) {
    const bouts = card.bouts.filter(b => missing.has(b.red.ufcFighterId) || missing.has(b.blue.ufcFighterId));
    if (!bouts.length) continue;
    // A card runs across midnight UTC, so API-Sports may file it under either date.
    const start = new Date(card.startsAt);
    const dates = [start, new Date(start.getTime() + DAY)].map(d => d.toISOString().slice(0, 10));
    const response: unknown[] = [];
    for (const date of dates) {
      if (!inPlan(date)) {
        report.deferredDates++;
        continue;
      }
      const payload = await request(`fights?date=${date}`, `photos ${card.name} ${date}`);
      response.push(...(((payload as { response?: unknown[] } | null)?.response) ?? []));
    }
    report.fetchedFights += response.length;
    if (!report.sampleFighterFields) {
      const first = (response[0] as { fighters?: { first?: object } } | undefined)?.fighters?.first;
      if (first) report.sampleFighterFields = Object.keys(first);
    }
    const matches = matchPhotos(bouts, { response }).filter(m => missing.has(m.ufcFighterId));
    report.matchedBouts += new Set(
      bouts.filter(b => matches.some(m => m.ufcFighterId === b.red.ufcFighterId || m.ufcFighterId === b.blue.ufcFighterId)).map(b => b.ufcFightId),
    ).size;
    await save(matches, `photos ${card.name}`);
  }

  // 2. By name, for anyone the date match could not reach. Each surname is
  // searched once per run.
  const searched = new Map<string, unknown>();
  const notFound: string[] = [];
  for (const card of byDate) {
    const matches: PhotoMatch[] = [];
    for (const bout of card.bouts) {
      for (const fighter of [bout.red, bout.blue]) {
        if (!missing.has(fighter.ufcFighterId)) continue;
        const term = searchTerm(fighter.name);
        if (!term) continue;
        if (!searched.has(term)) {
          const payload = await request(`fighters?search=${encodeURIComponent(term)}`, `photos search ${term}`);
          if (payload === null) continue;
          report.nameSearches++;
          searched.set(term, payload);
        }
        const match = matchByName({ ...fighter, weightClass: bout.weightClass }, searched.get(term));
        if (match) matches.push(match);
        else notFound.push(fighter.ufcFighterId);
      }
    }
    report.nameMatched += matches.length;
    await save(matches, `photos by name ${card.name}`);
  }
  if (notFound.length) {
    const { data: count, error: markError } = await db.rpc("mark_photo_checked", { ufc_fighter_ids: notFound });
    if (markError) fail("photos mark checked", markError.message);
    else report.notFound = count as number;
  }
  return report;
}
