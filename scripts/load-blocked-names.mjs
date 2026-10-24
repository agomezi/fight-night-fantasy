// Loads the blocked display-name list into the database.
//
//   node scripts/load-blocked-names.mjs           the local stack
//   node scripts/load-blocked-names.mjs --linked  the hosted project
//   add --dry-run                                 list what it would catch,
//                                                 change nothing
//
// The list lives in .env.blocked-names, which is gitignored: the terms are
// kept out of this public repository. See .env.blocked-names.example for the
// format. Loading replaces the whole list, then clears any player name the
// new list blocks; those players pick a new name next time they open the app.
// League names it blocks are listed by --dry-run and renamed by hand.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = ".env.blocked-names";
const MODES = new Set(["contains", "word", "name", "group", "hostile"]);
const target = process.argv.includes("--linked") ? "--linked" : "--local";
const dryRun = process.argv.includes("--dry-run");

// The database's normalize_handle: lowercase, digits read as letters, only
// letters kept, runs of one letter squeezed.
const normalize = (term) =>
  term
    .replace(/[0-9]/g, (d) => ({ 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b" })[d] ?? d)
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");

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
    console.error(`${FILE}:${i + 1}: expected "<contains|word|name|group|hostile> <lowercase letters and digits>"`);
    process.exit(1);
  }
  if (terms.has(term)) console.warn(`${FILE}:${i + 1}: "${term}" is listed twice; keeping ${mode}`);
  terms.set(term, mode);
});
if (!terms.size) {
  console.error(`${FILE} has no terms.`);
  process.exit(1);
}

// A group and a hostile term that overlap would let one word block itself.
const ofMode = (m) => [...terms].filter(([, mode]) => mode === m).map(([term]) => term);
for (const g of ofMode("group")) {
  for (const h of ofMode("hostile")) {
    if (normalize(g).includes(normalize(h)) || normalize(h).includes(normalize(g))) {
      console.error(`${FILE}: group "${g}" and hostile "${h}" overlap, so one word would block itself.`);
      process.exit(1);
    }
  }
}
if (!ofMode("group").length !== !ofMode("hostile").length) {
  console.warn(`${FILE}: group and hostile terms only work in pairs; one of the two lists is empty.`);
}

// One statement: the database swaps the list and clears blocked names
// atomically. Terms are validated as [a-z0-9]+ above, so the JSON is safe to
// quote inline.
const list = JSON.stringify([...terms].map(([term, match]) => ({ term, match })));
const sql = dryRun
  ? `select * from public.preview_blocked_names('${list}'::jsonb);
`
  : `select public.replace_blocked_names('${list}'::jsonb) as names_cleared;
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
  const where = target === "--linked" ? "hosted" : "local";
  if (dryRun) {
    console.log(`Dry run against the ${where} database; nothing changed. Names the list would catch:`);
    console.log(out);
    process.exit(0);
  }
  console.log(`Loaded ${terms.size} terms into the ${where} database.`);
  const cleared = out.match(/names_cleared\D*(\d+)/)?.[1];
  if (cleared !== undefined) console.log(`Names cleared: ${cleared}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
