// Loads the blocked display-name list into the database.
//
//   node scripts/load-blocked-names.mjs           the local stack
//   node scripts/load-blocked-names.mjs --linked  the hosted project
//
// The list lives in .env.blocked-names, which is gitignored: the terms are
// kept out of this public repository. See .env.blocked-names.example for the
// format. Loading replaces the whole list, then clears any player name the
// new list blocks; those players pick a new name next time they open the app.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = ".env.blocked-names";
const MODES = new Set(["contains", "word", "name"]);
const target = process.argv.includes("--linked") ? "--linked" : "--local";

let text;
try {
  text = readFileSync(FILE, "utf8");
} catch {
  console.error(`No ${FILE}. Copy ${FILE}.example to ${FILE} and fill it in.`);
  process.exit(1);
}

const terms = new Map();
text.split(/\r?\n/).forEach((raw, i) => {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return;
  const [mode, term, extra] = line.split(/\s+/);
  if (!MODES.has(mode) || !term || extra !== undefined || !/^[a-z0-9]+$/.test(term)) {
    console.error(`${FILE}:${i + 1}: expected "<contains|word|name> <lowercase letters and digits>"`);
    process.exit(1);
  }
  terms.set(term, mode);
});
if (!terms.size) {
  console.error(`${FILE} has no terms.`);
  process.exit(1);
}

// One statement: the database swaps the list and clears blocked names
// atomically. Terms are validated as [a-z0-9]+ above, so the JSON is safe to
// quote inline.
const list = JSON.stringify([...terms].map(([term, match]) => ({ term, match })));
const sql = `select public.replace_blocked_names('${list}'::jsonb) as names_cleared;
`;

// A temporary file outside the repository, removed straight after.
const dir = mkdtempSync(join(tmpdir(), "blocked-names-"));
const sqlFile = join(dir, "load.sql");
try {
  writeFileSync(sqlFile, sql);
  const out = execFileSync("npx", ["supabase", "db", "query", target, "-f", sqlFile], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  console.log(`Loaded ${terms.size} terms into the ${target === "--linked" ? "hosted" : "local"} database.`);
  const cleared = out.match(/names_cleared\D*(\d+)/)?.[1];
  if (cleared !== undefined) console.log(`Names cleared: ${cleared}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
