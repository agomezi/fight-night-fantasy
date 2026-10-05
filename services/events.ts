// The next card, as the schedule sync stored it. Formatting helpers are pure so
// they can be tested without a database.

export type CardSegment = "main" | "prelims" | "early_prelims";
export type EventFighter = { id: string; name: string; nickname: string | null; photoUrl: string | null };
export type EventBout = {
  id: string;
  order: number;
  segment: CardSegment | null;
  scheduledRounds: number;
  weightClass: string | null;
  /** Bumped on a substitution; a pick is saved against the version it saw. */
  version: number;
  /** When this bout's part of the card starts; picks on it lock here. */
  locksAt: Date;
  red: EventFighter;
  blue: EventFighter;
};
export type NextEvent = {
  id: string;
  name: string;
  startsAt: Date;
  locksAt: Date;
  status: "scheduled" | "live";
  /** Scheduled bouts only, main event first. */
  bouts: EventBout[];
};

/** Wide enough to keep a card that is still being fought on screen. */
const STILL_RUNNING_MS = 12 * 60 * 60 * 1000;

export const NEXT_EVENT_QUERY = `
  id, name, starts_at, locks_at, status,
  bouts!bouts_event_id_fkey (
    id, fight_order, card_segment, scheduled_rounds, weight_class, version, status, locks_at,
    red:fighters!bouts_red_fighter_id_fkey ( id, name, nickname, photoUrl:photo_url ),
    blue:fighters!bouts_blue_fighter_id_fkey ( id, name, nickname, photoUrl:photo_url )
  )`;

type Row = {
  id: string;
  name: string;
  starts_at: string;
  locks_at: string;
  status: "scheduled" | "live";
  bouts: {
    id: string;
    fight_order: number;
    card_segment: CardSegment | null;
    scheduled_rounds: number;
    weight_class: string | null;
    version: number;
    status: "scheduled" | "cancelled";
    locks_at: string | null;
    red: EventFighter;
    blue: EventFighter;
  }[];
};

export function toNextEvent(row: Row): NextEvent {
  return {
    id: row.id,
    name: row.name,
    startsAt: new Date(row.starts_at),
    locksAt: new Date(row.locks_at),
    status: row.status,
    bouts: row.bouts
      .filter((b) => b.status === "scheduled")
      .sort((a, b) => a.fight_order - b.fight_order)
      .map((b) => ({
        id: b.id,
        order: b.fight_order,
        segment: b.card_segment,
        scheduledRounds: b.scheduled_rounds,
        weightClass: b.weight_class,
        version: b.version,
        // A bout entered by hand has no lock of its own and goes by the card's.
        locksAt: new Date(b.locks_at ?? row.locks_at),
        red: b.red,
        blue: b.blue,
      })),
  };
}

export async function fetchNextEvent(now: Date = new Date()): Promise<NextEvent | null> {
  // Imported here so the pure helpers above load without the native client.
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("events")
    .select(NEXT_EVENT_QUERY)
    .in("status", ["scheduled", "live"])
    .gte("starts_at", new Date(now.getTime() - STILL_RUNNING_MS).toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toNextEvent(data as unknown as Row) : null;
}

/** "UFC 332: Silva vs. Wang" -> { title: "UFC 332", headline: "Silva vs. Wang" }. */
export function splitEventName(name: string): { title: string; headline: string | null } {
  const at = name.indexOf(":");
  if (at < 0) return { title: name.trim(), headline: null };
  return { title: name.slice(0, at).trim(), headline: name.slice(at + 1).trim() || null };
}

/** The surname a card is billed by: "Natalia Silva" -> "Silva", "Raul Rosas Jr." -> "Rosas Jr.". */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 2 && /^(jr|sr|ii|iii|iv)\.?$/i.test(parts[parts.length - 1])) {
    return parts.slice(-2).join(" ");
  }
  return parts[parts.length - 1];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Whole days, hours and minutes until `target`, never negative. */
export function countdown(target: Date, now: Date): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Whether picks on this bout have closed. */
export function boutLocked(bout: Pick<EventBout, "locksAt">, now: Date): boolean {
  return bout.locksAt.getTime() <= now.getTime();
}

/** The next time part of the card locks, or null once all of it has. */
export function nextLock(bouts: Pick<EventBout, "locksAt">[], now: Date): Date | null {
  const upcoming = bouts.map((b) => b.locksAt.getTime()).filter((t) => t > now.getTime());
  return upcoming.length ? new Date(Math.min(...upcoming)) : null;
}

/** Short time-to-lock for badges: "2D 14H", "14H", "45M", "LOCKED". */
export function lockLabel(locksAt: Date, now: Date): string {
  if (locksAt.getTime() <= now.getTime()) return "LOCKED";
  const { days, hours, minutes } = countdown(locksAt, now);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H`;
  return `${Math.max(1, minutes)}M`;
}

/** "SAT · 4PM ET" — Eastern, since that is how UFC bills its start times. */
export function startLabel(startsAt: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(startsAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = get("minute");
  const time = `${get("hour")}${minute === "00" ? "" : `:${minute}`}${get("dayPeriod")}`;
  return `${get("weekday")} · ${time} ET`.toUpperCase();
}
