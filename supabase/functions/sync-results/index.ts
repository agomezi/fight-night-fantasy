// Live results sync, called by pg_cron whenever an event is due (see the
// live_results migration).
//
//   {}                    every event that is due now
//   { "eventId": "…" }    one stored event, due or not, for a manual re-run
//
// For each event: read the UFC stats feed, write any result that changed,
// re-score the whole card, then decide when to look again. One event failing
// never stops the others, and a failed event is retried on the next cycle.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseResults, type LiveCard } from "../../../services/ingestion/results.ts";
import { scoreEvent } from "../../../services/eventScoring.ts";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** How long until this event is worth reading again. */
function nextPollIn(card: LiveCard, hasProvisional: boolean): number {
  // A fight is on, from walkout to result: this is where latency matters.
  if (card.liveFightId || card.bouts.some(b => b.status === "live")) return 30 * SECOND;
  if (card.status === "live") return MINUTE; // between fights
  if (card.status === "scheduled") return 5 * MINUTE; // before the first bout
  // The card is over. Results read provisional until the feed marks them
  // final, which takes about ten minutes; after that, check a few times a
  // day for the rest of the week in case a result is overturned.
  return hasProvisional ? 2 * MINUTE : 6 * 60 * MINUTE;
}

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

type Db = ReturnType<typeof createClient>;

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function syncEvent(db: Db, feed: string, eventId: string, ufcEventId: string) {
  const response = await fetch(`${feed}/${ufcEventId}.json`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from the feed`);
  const card = parseResults(await response.json());

  const { data: recorded, error: recordError } = await db.rpc("record_event_results", { card });
  if (recordError) throw new Error(recordError.message);

  // Re-score from what is stored, not from the feed: a manual correction or a
  // cancellation from the card sync has to count too.
  const bouts = await rows(db.from("bouts")
    .select("id, version, status, red_fighter_id, blue_fighter_id, card_segment, underdog_corner")
    .eq("event_id", eventId));
  const boutIds = bouts.map(b => b.id as string);
  const results = boutIds.length
    ? await rows(db.from("results").select("bout_id, status, winner_fighter_id, method, round, void_reason").in("bout_id", boutIds))
    : [];
  const picks = boutIds.length
    ? await rows(db.from("picks").select("user_id, bout_id, bout_version, picked_fighter_id, finish, finish_round, method").in("bout_id", boutIds))
    : [];
  // deno-lint-ignore no-explicit-any
  const scores = scoreEvent(bouts as any, results as any, picks as any);
  const { data: replaced, error: scoreError } = await db.rpc("replace_event_scores", { event_id: eventId, score_rows: scores });
  if (scoreError) throw new Error(scoreError.message);

  const hasProvisional = results.some(r => r.status === "provisional");
  const dueAt = new Date(Date.now() + nextPollIn(card, hasProvisional)).toISOString();
  const { error: dueError } = await db.rpc("set_results_due", { event_id: eventId, due_at: dueAt });
  if (dueError) throw new Error(dueError.message);

  const issues = card.bouts.flatMap(b => (b.issues ?? []).map(issue => `fight ${b.ufcFightId}: ${issue}`));
  return {
    ufcEventId,
    status: card.status,
    results: recorded,
    scores: { ...replaced, total: scores.length },
    nextPoll: dueAt,
    ...(issues.length ? { issues } : {}),
  };
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!sameSecret(request.headers.get("x-card-sync-secret"), env("CARD_SYNC_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { eventId } = await request.json().catch(() => ({}));

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const feed = env("UFC_FEED_BASE_URL").replace(/\/+$/, "");

  let events: { id: string; ufc_event_id: string }[];
  try {
    events = typeof eventId === "string"
      ? await rows(db.from("events").select("id, ufc_event_id").eq("id", eventId).not("ufc_event_id", "is", null))
      : await rows(db.rpc("events_due_for_results"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }

  const synced: unknown[] = [];
  const errors: { event: string; error: string }[] = [];
  for (const ev of events) {
    try {
      synced.push(await syncEvent(db, feed, ev.id, ev.ufc_event_id));
    } catch (error) {
      errors.push({ event: ev.ufc_event_id, error: error instanceof Error ? error.message : String(error) });
      // Back off a little so a broken event does not hammer the feed every
      // 30 seconds, without waiting long enough to miss a result.
      await db.rpc("set_results_due", { event_id: ev.id, due_at: new Date(Date.now() + MINUTE).toISOString() });
    }
  }

  const report = { synced, errors };
  console.log(JSON.stringify(report));
  return Response.json(report, { status: errors.length ? 207 : 200 });
});
