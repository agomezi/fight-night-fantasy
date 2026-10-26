// One fight's strike and grappling stats from the UFC stats feed's per-fight
// stats file, for the results sync. Pure and dependency-free, so the Edge
// Function loads it under Deno.
//
// The feed keys stats by fighter, not corner, so each side carries its UFC
// fighter id and the database lines it up with our red and blue (a corner
// swap after the card sync must not swap the numbers).
//
// Only checked against a finished fight so far, so mid-round it reads what it
// can: a missing number is zero, numbers sent as text are read, a round only
// one side has yet gets zeros for the other, and missing fight totals are
// added up from the rounds. With neither totals nor rounds it returns null and
// nothing is stored.

/** [landed, attempted] */
export type Pair = [number, number];

export type FighterStats = {
  ufcFighterId: string;
  knockdowns: number;
  sig: Pair;
  total: Pair;
  takedowns: Pair;
  subAttempts: number;
  reversals: number;
  /** Seconds. */
  control: number;
  head: Pair;
  body: Pair;
  leg: Pair;
  distance: Pair;
  clinch: Pair;
  ground: Pair;
};

export type RoundStats = { round: number; red: FighterStats; blue: FighterStats };

export type FightStats = {
  ufcFightId: string;
  /** The feed marks the numbers official a few minutes after the result. */
  official: boolean;
  /** "upcoming" | "live" | "over" | "final", lower-cased from the feed. */
  status: string;
  /** The round in progress, while this fight is the live one. */
  liveRound: number | null;
  /** "3:14" into the live round, as of this read. */
  liveClock: string | null;
  red: FighterStats;
  blue: FighterStats;
  rounds: RoundStats[];
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

function count(v: unknown): number {
  const n = typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}
function pair(s: Json, prefix: string): Pair {
  return [count(s[`${prefix}Landed`]), count(s[`${prefix}Attempted`])];
}
/** "4:07" → 247, a plain number of seconds as is; anything else → 0. */
export function seconds(v: unknown): number {
  if (typeof v === "number") return count(v);
  const m = typeof v === "string" ? /^(\d{1,2}):([0-5]\d)$/.exec(v.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function fighterStats(s: Json, ufcFighterId: string): FighterStats {
  return {
    ufcFighterId,
    knockdowns: count(s.Knockdowns),
    sig: pair(s, "SigStrikes"),
    total: pair(s, "TotalStrikes"),
    takedowns: pair(s, "Takedowns"),
    subAttempts: count(s.SubmissionsAttempted),
    reversals: count(s.Reversals),
    control: seconds(s.ControlTime),
    head: pair(s, "SigHeadStrikes"),
    body: pair(s, "SigBodyStrikes"),
    leg: pair(s, "SigLegStrikes"),
    distance: pair(s, "SigDistanceStrikes"),
    clinch: pair(s, "SigClinchStrikes"),
    ground: pair(s, "SigGroundStrikes"),
  };
}

const ZERO: Omit<FighterStats, "ufcFighterId"> = {
  knockdowns: 0, sig: [0, 0], total: [0, 0], takedowns: [0, 0], subAttempts: 0, reversals: 0, control: 0,
  head: [0, 0], body: [0, 0], leg: [0, 0], distance: [0, 0], clinch: [0, 0], ground: [0, 0],
};
const add = (a: Pair, b: Pair): Pair => [a[0] + b[0], a[1] + b[1]];

/** Fight totals added up from the rounds, for a file that has rounds only. */
function sumRounds(list: FighterStats[], ufcFighterId: string): FighterStats {
  return list.reduce<FighterStats>((t, r) => ({
    ufcFighterId,
    knockdowns: t.knockdowns + r.knockdowns,
    sig: add(t.sig, r.sig),
    total: add(t.total, r.total),
    takedowns: add(t.takedowns, r.takedowns),
    subAttempts: t.subAttempts + r.subAttempts,
    reversals: t.reversals + r.reversals,
    control: t.control + r.control,
    head: add(t.head, r.head),
    body: add(t.body, r.body),
    leg: add(t.leg, r.leg),
    distance: add(t.distance, r.distance),
    clinch: add(t.clinch, r.clinch),
    ground: add(t.ground, r.ground),
  }), { ufcFighterId, ...ZERO });
}

const idOf = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? String(v) : null);

/** Reads one fight's stats, or null when the file has none to show yet. */
export function parseFightStats(payload: unknown): FightStats | null {
  const root = isObject(payload) ? payload : null;
  const fight = root && isObject(root.LiveFightDetail) ? root.LiveFightDetail : root;
  if (!fight) return null;
  const ufcFightId = idOf(fight.FightId);
  if (!ufcFightId || !Array.isArray(fight.Fighters) || fight.Fighters.length !== 2) return null;

  // Corner by fighter id, from the fight's own fighter list.
  const corners = new Map<string, "red" | "blue">();
  for (const f of fight.Fighters) {
    const id = isObject(f) ? idOf(f.FighterId) : null;
    const corner = isObject(f) ? String(f.Corner ?? "").toLowerCase() : "";
    if (id && (corner === "red" || corner === "blue")) corners.set(id, corner);
  }
  if (corners.size !== 2 || new Set(corners.values()).size !== 2) return null;
  const idFor = (corner: "red" | "blue") => [...corners].find(([, c]) => c === corner)![0];

  const byCorner = (list: unknown) => {
    const out: Partial<Record<"red" | "blue", Json>> = {};
    if (!Array.isArray(list)) return out;
    for (const s of list) {
      const id = isObject(s) ? idOf(s.FighterId) : null;
      const corner = id ? corners.get(id) : undefined;
      if (corner) out[corner] = s as Json;
    }
    return out;
  };

  const totals = byCorner(fight.FightStats);

  const roundMaps = byCorner(fight.RoundStats);
  const roundsOf = (s: Json | undefined) => {
    const m = new Map<number, Json>();
    if (s && Array.isArray(s.Rounds)) {
      for (const r of s.Rounds) {
        const n = isObject(r) ? count(r.RoundNumber) : 0;
        if (n >= 1 && n <= 5) m.set(n, r as Json);
      }
    }
    return m;
  };
  const redRounds = roundsOf(roundMaps.red);
  const blueRounds = roundsOf(roundMaps.blue);
  // A round only one side has yet (mid-round) counts as nothing landed for the
  // other.
  const side = (m: Map<number, Json>, n: number, id: string) => (m.has(n) ? fighterStats(m.get(n)!, id) : { ufcFighterId: id, ...ZERO });
  const rounds: RoundStats[] = [...new Set([...redRounds.keys(), ...blueRounds.keys()])]
    .sort((a, b) => a - b)
    .map(n => ({ round: n, red: side(redRounds, n, idFor("red")), blue: side(blueRounds, n, idFor("blue")) }));

  // Both sides from the same source, so a half-sent totals block can't put
  // one corner a round ahead of the other.
  const both = !!(totals.red && totals.blue);
  const total = (corner: "red" | "blue") =>
    both ? fighterStats(totals[corner]!, idFor(corner)) : sumRounds(rounds.map(r => r[corner]), idFor(corner));
  if (!both && rounds.length === 0) return null;

  // The live round and clock sit on the event block, and only name this
  // fight while it is the one in the cage.
  const event = isObject(fight.Event) ? fight.Event : {};
  const isLive = idOf(event.LiveFightId) === ufcFightId;
  const liveRound = isLive ? count(event.LiveRoundNumber) || null : null;
  const clock = isLive && typeof event.LiveRoundElapsedTime === "string" && seconds(event.LiveRoundElapsedTime) > 0
    ? event.LiveRoundElapsedTime.trim()
    : null;

  return {
    ufcFightId,
    official: fight.OfficialStats === true,
    status: String(fight.Status ?? "").toLowerCase(),
    liveRound,
    liveClock: clock,
    red: total("red"),
    blue: total("blue"),
    rounds,
  };
}
