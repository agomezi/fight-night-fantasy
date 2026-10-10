// Each fighter's UFC history, summed up for the Fighter Spotlight: wins by
// method and the current win streak. Read from a UFCStats-style fight table
// (one row per fight: both fighters, the winner, the method and the date).
// Pure, so it runs under jest and under Node for scripts/load-fighter-stats.

export type FightRow = {
  fighter1: string;
  fighter2: string;
  /** A fighter's name, or anything else for a draw or no contest. */
  winner: string;
  method: string;
  /** "YYYY-MM-DD". */
  date: string;
};

export type FighterHistory = {
  name: string;
  wins: number;
  losses: number;
  koWins: number;
  subWins: number;
  decWins: number;
  /** Wins in a row up to their latest fight; a loss or draw ends it. */
  winStreak: number;
  lastFight: string;
};

type Finish = "ko" | "sub" | "dec" | "other";

function finish(method: string): Finish {
  const m = method.toLowerCase();
  if (m.includes("ko") || m.includes("doctor")) return "ko";
  if (m.includes("submission")) return "sub";
  if (m.includes("decision")) return "dec";
  return "other"; // DQ, could not continue
}

export function summarizeHistory(rows: FightRow[]): FighterHistory[] {
  const byFighter = new Map<string, { date: string; result: "W" | "L" | "D"; how: Finish }[]>();
  for (const row of rows) {
    // An overturned result counts for no one, and doesn't end a streak.
    if (/overturned/i.test(row.method)) continue;
    for (const [me, them] of [[row.fighter1, row.fighter2], [row.fighter2, row.fighter1]]) {
      if (!me) continue;
      const result = row.winner === me ? "W" : row.winner === them ? "L" : "D";
      const list = byFighter.get(me) ?? [];
      list.push({ date: row.date, result, how: finish(row.method) });
      byFighter.set(me, list);
    }
  }

  return [...byFighter].map(([name, fights]) => {
    fights.sort((a, b) => a.date.localeCompare(b.date));
    const wins = fights.filter((f) => f.result === "W");
    let winStreak = 0;
    for (let i = fights.length - 1; i >= 0 && fights[i].result === "W"; i--) winStreak++;
    return {
      name,
      wins: wins.length,
      losses: fights.filter((f) => f.result === "L").length,
      koWins: wins.filter((f) => f.how === "ko").length,
      subWins: wins.filter((f) => f.how === "sub").length,
      decWins: wins.filter((f) => f.how === "dec").length,
      winStreak,
      lastFight: fights[fights.length - 1].date,
    };
  });
}

/** Rows of a CSV with a header line, as objects. Handles quoted fields. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((r) => r.some((f) => f !== ""));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ""), r[i] ?? ""])));
}

/** The fight table the fight-predictor project keeps, as FightRows. */
export function fightRowsFromCsv(text: string): FightRow[] {
  return parseCsv(text).map((r) => ({
    fighter1: r.Fighter_1?.trim() ?? "",
    fighter2: r.Fighter_2?.trim() ?? "",
    winner: r.Winner?.trim() ?? "",
    method: r.Method?.trim() ?? "",
    date: r.Event_Date?.trim() ?? "",
  }));
}
