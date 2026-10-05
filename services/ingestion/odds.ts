// Matching card bouts to The Odds API's moneylines, for the underdog bonus.
// Pure and dependency-free, so the odds Edge Function imports it under Deno.
//
// The Odds API lists every MMA promotion together and gives a whole card one
// start time, so a bout is found by its pair of fighters on the card's date:
// both names must match one listed fight, in either order. Anything else is
// left unmatched rather than guessed, because a wrong underdog changes scores.

import { nameKey, sameFighter } from "./photos.ts";

export type OddsBout = {
  boutId: string;
  /** When the bout's card starts. */
  startsAt: string;
  red: string;
  blue: string;
};

/** Consensus American odds for each corner, averaged across bookmakers. */
export type BoutOdds = { boutId: string; redOdds: number; blueOdds: number; books: number };

export type OddsMatch = {
  odds: BoutOdds[];
  /** Bouts with no single listed fight, by name, for the run report. */
  unmatched: string[];
  /** Bouts found but with no bookmaker offering a line yet. */
  noLines: string[];
};

type Outcome = { name: string; price: number };
type ApiEvent = { commenceTime: number; home: string; away: string; books: Outcome[][] };

/** A card runs late into the night, and its listed start may be a guess. */
const SAME_CARD_MS = 36 * 60 * 60 * 1000;

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The same first initial and a surname a transliteration away
 * ("Daria Zhelezniakova" / "Darya Zheleznyakova"). Only trusted alongside an
 * exact match for the opponent. */
function nearlySameFighter(a: string, b: string): boolean {
  if (sameFighter(a, b)) return true;
  const x = nameKey(a).split(" ");
  const y = nameKey(b).split(" ");
  if (x.length < 2 || y.length < 2 || x[0][0] !== y[0][0]) return false;
  const [xs, ys] = [x[x.length - 1], y[y.length - 1]];
  return Math.min(xs.length, ys.length) >= 5 && editDistance(xs, ys) <= 2;
}

/** Both fighters, at least one of them exactly. */
function samePair(red: string, blue: string, a: string, b: string): boolean {
  return (sameFighter(red, a) && nearlySameFighter(blue, b)) || (nearlySameFighter(red, a) && sameFighter(blue, b));
}

/** The chance an American price implies, bookmaker margin included. */
export function impliedProbability(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}

/** The American price for a probability, rounded to a whole number. */
export function americanOdds(probability: number): number {
  return probability >= 0.5
    ? -Math.round((100 * probability) / (1 - probability))
    : Math.round((100 * (1 - probability)) / probability);
}

function apiEvents(payload: unknown): ApiEvent[] {
  if (!Array.isArray(payload)) return [];
  const events: ApiEvent[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const commenceTime = Date.parse(String(e.commence_time));
    if (typeof e.home_team !== "string" || typeof e.away_team !== "string" || Number.isNaN(commenceTime)) continue;
    const books: Outcome[][] = [];
    for (const book of Array.isArray(e.bookmakers) ? e.bookmakers : []) {
      const markets = (book as { markets?: unknown })?.markets;
      const h2h = Array.isArray(markets) ? markets.find((m) => (m as { key?: unknown })?.key === "h2h") : null;
      const outcomes = (h2h as { outcomes?: unknown } | null)?.outcomes;
      if (!Array.isArray(outcomes)) continue;
      const valid = outcomes.filter(
        (o): o is Outcome => !!o && typeof o.name === "string" && typeof o.price === "number" && Math.abs(o.price) >= 100,
      );
      // A line with a draw outcome or a missing side is not a two-way moneyline.
      if (valid.length === 2) books.push(valid);
    }
    events.push({ commenceTime, home: e.home_team, away: e.away_team, books });
  }
  return events;
}

/** Odds for each bout that can be matched with confidence. */
export function matchOdds(bouts: OddsBout[], payload: unknown): OddsMatch {
  const events = apiEvents(payload);
  const result: OddsMatch = { odds: [], unmatched: [], noLines: [] };
  for (const bout of bouts) {
    const label = `${bout.red} vs ${bout.blue}`;
    const startsAt = Date.parse(bout.startsAt);
    const found = events.filter(
      (e) =>
        Math.abs(e.commenceTime - startsAt) <= SAME_CARD_MS &&
        (samePair(bout.red, bout.blue, e.home, e.away) || samePair(bout.red, bout.blue, e.away, e.home)),
    );
    if (found.length !== 1) {
      result.unmatched.push(label);
      continue;
    }

    // Each bookmaker's two prices, put in our corners by name.
    const red: number[] = [];
    const blue: number[] = [];
    for (const [a, b] of found[0].books) {
      const aIsRed = samePair(bout.red, bout.blue, a.name, b.name);
      const aIsBlue = samePair(bout.red, bout.blue, b.name, a.name);
      if (aIsRed === aIsBlue) continue;
      red.push(impliedProbability(aIsRed ? a.price : b.price));
      blue.push(impliedProbability(aIsRed ? b.price : a.price));
    }
    if (!red.length) {
      result.noLines.push(label);
      continue;
    }
    const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
    result.odds.push({ boutId: bout.boutId, redOdds: americanOdds(mean(red)), blueOdds: americanOdds(mean(blue)), books: red.length });
  }
  return result;
}
