// Upcoming-card parsing for the schedule sync. Pure and dependency-free, so the
// Edge Function that runs the sync can import this file directly under Deno.

export type CardSegment = "main" | "prelims" | "early_prelims";
export type CardStatus = "scheduled" | "live" | "complete";
/** What the feed says about a fighter beyond their name. Snapshotted on every
 * sync, so the record is current as of the card. */
export type FighterProfile = {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  /** "1995-12-28". */
  dob: string | null;
  /** Inches. */
  heightIn: number | null;
  reachIn: number | null;
  stance: string | null;
};
export type CardFighter = {
  ufcFighterId: string;
  name: string;
  nickname: string | null;
  /** Absent when the feed has no record for them. */
  profile?: FighterProfile;
};
export type CardBout = {
  ufcFightId: string;
  /** 1 is the main event. */
  order: number;
  /** Null until UFC splits the card into segments, which it does weeks out. */
  segment: CardSegment | null;
  scheduledRounds: 3 | 5;
  weightClass: string | null;
  /** When this bout's part of the card starts; picks on it lock here. The
   * event start until UFC splits the card into segments. */
  locksAt: string;
  red: CardFighter;
  blue: CardFighter;
};
export type IngestedCard = {
  ufcEventId: string;
  name: string;
  /** When the first bout of the night begins; picks lock here. */
  startsAt: string;
  status: CardStatus;
  bouts: CardBout[];
  /** Data that was repaired rather than trusted, for the sync report. */
  issues: string[];
};

const SEGMENTS: Record<string, CardSegment> = { Main: "main", Prelims1: "prelims", Prelims2: "early_prelims" };
const STATUSES: Record<string, CardStatus> = { Upcoming: "scheduled", Live: "live", Over: "complete", Final: "complete" };
/** Organization 1 is the UFC itself; Contender Series and Road to UFC are not. */
const UFC_ORGANIZATION_ID = 1;

type Json = Record<string, unknown>;
function object(value: unknown, what: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected ${what} to be an object`);
  return value as Json;
}
function id(value: unknown, what: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  throw new Error(`Missing ${what}`);
}
function time(value: unknown, what: string): number {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) throw new Error(`Missing or invalid ${what}`);
  return ms;
}
function words(...parts: unknown[]): string {
  return parts.filter(p => typeof p === "string").join(" ").replace(/\s+/g, " ").trim();
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const measure = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);

/** The record and measurements, read leniently: a missing or odd value is
 * left out rather than failing the card. */
function parseProfile(f: Json): FighterProfile | undefined {
  const record = f.Record && typeof f.Record === "object" ? (f.Record as Json) : null;
  const wins = count(record?.Wins);
  const losses = count(record?.Losses);
  if (wins == null || losses == null) return undefined;
  const dob = typeof f.DOB === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.DOB) ? f.DOB : null;
  return {
    wins,
    losses,
    draws: count(record?.Draws) ?? 0,
    noContests: count(record?.NoContests) ?? 0,
    dob,
    heightIn: measure(f.Height),
    reachIn: measure(f.Reach),
    stance: words(f.Stance) || null,
  };
}

function parseFighter(value: unknown, fightId: string): CardFighter & { corner: string } {
  const f = object(value, `fighter in fight ${fightId}`);
  const name = object(f.Name, `fighter name in fight ${fightId}`);
  const full = words(name.FirstName, name.LastName);
  if (!full) throw new Error(`Missing fighter name in fight ${fightId}`);
  const nickname = words(name.NickName) || null;
  const profile = parseProfile(f);
  return {
    ufcFighterId: id(f.FighterId, `fighter id in fight ${fightId}`),
    name: full,
    nickname,
    ...(profile ? { profile } : {}),
    corner: String(f.Corner),
  };
}

function parseBout(value: unknown, issues: string[]): Omit<CardBout, "locksAt"> & { segmentStart: number | null } {
  const b = object(value, "fight");
  const ufcFightId = id(b.FightId, "fight id");
  const order = b.FightOrder;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) throw new Error(`Invalid order for fight ${ufcFightId}`);

  let segment: CardSegment | null = null;
  if (b.CardSegment != null) {
    segment = SEGMENTS[String(b.CardSegment)];
    if (!segment) throw new Error(`Unknown card segment ${JSON.stringify(b.CardSegment)} in fight ${ufcFightId}`);
  }

  if (!Array.isArray(b.Fighters) || b.Fighters.length !== 2) throw new Error(`Fight ${ufcFightId} does not have two fighters`);
  const fighters = b.Fighters.map(f => parseFighter(f, ufcFightId));
  const red = fighters.find(f => f.corner === "Red");
  const blue = fighters.find(f => f.corner === "Blue");
  if (!red || !blue) throw new Error(`Fight ${ufcFightId} needs one red and one blue corner`);
  if (red.ufcFighterId === blue.ufcFighterId) throw new Error(`Duplicate fighter in fight ${ufcFightId}`);

  // The rule set states the rounds. The feed sometimes lists "3 Rnd + OT" as
  // four possible rounds, so the description's leading count wins next; past
  // that, fall back to the UFC's standing rule that main events and title
  // fights go five.
  const rules = b.RuleSet && typeof b.RuleSet === "object" ? (b.RuleSet as Json) : {};
  const described = typeof rules.Description === "string" ? rules.Description.match(/^\s*([35])\s*Rnd\b/i)?.[1] : undefined;
  const accolades = Array.isArray(b.Accolades) ? b.Accolades : [];
  const isTitle = accolades.some(a => a && typeof a === "object" && (a as Json).Type === "Belt");
  let scheduledRounds: 3 | 5;
  if (rules.PossibleRounds === 3 || rules.PossibleRounds === 5) scheduledRounds = rules.PossibleRounds;
  else {
    scheduledRounds = described ? (Number(described) as 3 | 5) : order === 1 || isTitle ? 5 : 3;
    issues.push(`Fight ${ufcFightId} lists ${JSON.stringify(rules.PossibleRounds)} rounds (${JSON.stringify(rules.Description)}); using ${scheduledRounds}`);
  }

  const weight = b.WeightClass && typeof b.WeightClass === "object" ? (b.WeightClass as Json) : {};
  const weightClass = words(weight.Description) || null;
  const segmentStart = b.CardSegmentStartTime == null ? null : time(b.CardSegmentStartTime, `segment start for fight ${ufcFightId}`);

  const strip = ({ corner, ...fighter }: CardFighter & { corner: string }): CardFighter => fighter;
  return { ufcFightId, order, segment, scheduledRounds, weightClass, red: strip(red), blue: strip(blue), segmentStart };
}

/** Parses one event from the UFC live-stats feed. Returns null for events run
 * by another organization, which never count. Missing structure throws, since
 * a half-read card would cancel every bout the sync failed to see.
 */
export function parseCard(payload: unknown): IngestedCard | null {
  const root = object(payload, "payload");
  const event = object(root.LiveEventDetail ?? root, "event");
  const organization = object(event.Organization, "organization");
  if (organization.OrganizationId !== UFC_ORGANIZATION_ID) return null;

  const ufcEventId = id(event.EventId, "event id");
  const name = words(event.Name);
  if (!name) throw new Error(`Missing name for event ${ufcEventId}`);
  const status = STATUSES[String(event.Status)];
  if (!status) throw new Error(`Unknown status ${JSON.stringify(event.Status)} for event ${ufcEventId}`);
  if (!Array.isArray(event.FightCard) || !event.FightCard.length) throw new Error(`Event ${ufcEventId} has no fights`);

  const issues: string[] = [];
  const parsed = event.FightCard.map(b => parseBout(b, issues)).sort((a, b) => a.order - b.order);
  if (new Set(parsed.map(b => b.ufcFightId)).size !== parsed.length) throw new Error(`Duplicate fight ids in event ${ufcEventId}`);
  if (new Set(parsed.map(b => b.order)).size !== parsed.length) throw new Error(`Duplicate fight order in event ${ufcEventId}`);

  // The event start is the earliest segment, normally the early prelims.
  const starts = [time(event.StartTime, `start time for event ${ufcEventId}`), ...parsed.flatMap(b => (b.segmentStart == null ? [] : [b.segmentStart]))];
  const startsAt = new Date(Math.min(...starts)).toISOString();

  const bouts = parsed.map(({ segmentStart, ...bout }) => ({
    ...bout,
    locksAt: segmentStart == null ? startsAt : new Date(segmentStart).toISOString(),
  }));
  return { ufcEventId, name, startsAt, status, bouts, issues };
}

/** Event slugs from the "upcoming" half of the UFC.com events listing, in page order. */
export function upcomingEventSlugs(html: string): string[] {
  const start = html.indexOf('id="events-list-upcoming"');
  if (start < 0) throw new Error("Events listing has no upcoming section; page may be blocked or changed");
  const end = html.indexOf('id="events-list-past"', start);
  const section = html.slice(start, end < 0 ? undefined : end);
  const slugs = [...section.matchAll(/href="\/event\/([a-z0-9-]+)"/g)].map(m => m[1]);
  return [...new Set(slugs)];
}

/** The feed id embedded in a UFC.com event page, or null for a card UFC has
 * announced but not yet entered in the stats feed, which is normal weeks out.
 */
export function eventFmid(html: string): string | null {
  return html.match(/"event_fmid":"(\d+)"/)?.[1] ?? null;
}
