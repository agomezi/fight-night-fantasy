// Loads each UFC fighter's history (wins by method, win streak) for the
// Fighter Spotlight.
//
//   node --experimental-strip-types scripts/load-fighter-stats.ts           the local stack
//   node --experimental-strip-types scripts/load-fighter-stats.ts --linked  the hosted project
//   ... --csv <path>   a different fight table
//
// The source is the fight table the fight-predictor project keeps, read where
// it sits and never copied here: only the totals are sent. Run it once: fights
// after the table's last date are counted from our own results as they come
// in. Rerunning, after the table is refreshed, only corrects the history.
// Loading replaces every stored history.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fightRowsFromCsv, summarizeHistory } from "../services/ingestion/fightHistory.ts";

const DEFAULT_CSV = "../../fight-predictor/data/ufc_gold_dataset_final.csv";
const args = process.argv.slice(2);
const target = args.includes("--linked") ? "--linked" : "--local";
const csvAt = args.indexOf("--csv");
const csvPath = csvAt >= 0 ? args[csvAt + 1] : DEFAULT_CSV;

let text: string;
try {
  text = readFileSync(csvPath, "utf8");
} catch {
  console.error(`Can't read ${csvPath}. Pass --csv <path to the fight table>.`);
  process.exit(1);
}

const rows = fightRowsFromCsv(text).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
if (!rows.length) {
  console.error(`${csvPath} has no fights with Fighter_1, Fighter_2, Winner, Method and Event_Date.`);
  process.exit(1);
}
const asOf = rows.reduce((latest, r) => (r.date > latest ? r.date : latest), "");
const stats = summarizeHistory(rows);

// Dollar-quoted, so names with apostrophes need no escaping.
const json = JSON.stringify(stats);
if (json.includes("$stats$")) throw new Error("Unexpected $stats$ in the data");
const sql = `select * from public.load_fighter_stats($stats$${json}$stats$::jsonb, '${asOf}');\n`;

// A temporary file outside the repository, removed straight after.
const dir = mkdtempSync(join(tmpdir(), "fighter-stats-"));
const sqlFile = join(dir, "load.sql");
try {
  writeFileSync(sqlFile, sql);
  const out = execFileSync("npx", ["supabase", "db", "query", target, "-f", sqlFile], {
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  });
  console.log(`Loaded ${stats.length} fighters' UFC history to ${asOf} into the ${target === "--linked" ? "hosted" : "local"} database.`);
  console.log(out.trim());
} finally {
  rmSync(dir, { recursive: true, force: true });
}
