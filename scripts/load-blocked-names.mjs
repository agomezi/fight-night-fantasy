// Loads the blocked display-name list into the database.
//
//   node scripts/load-blocked-names.mjs                 the local stack
//   node scripts/load-blocked-names.mjs --linked        the hosted project
//
// It always lists first what the new list would catch: the player names it
// would clear and the league names it would refuse. Nothing changes until
// you run it again with --yes. --dry-run only lists. (Listing swaps the list
// inside a transaction that is rolled back, so on hosted it is a write that
// leaves no trace, not a read-only query.)
//
// The list lives in .env.blocked-names, which is gitignored: the terms are
// kept out of this public repository. See .env.blocked-names.example for the
// format. Loading replaces the whole list, then clears any player name the
// new list blocks; those players pick a new name next time they open the app.
// League names are renamed by hand.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILE = ".env.blocked-names";
const MODES = new Set(["contains", "word", "name", "group", "hostile", "root", "allow"]);
const args = process.argv.slice(2);
const unknown = args.filter((a) => !["--linked", "--dry-run", "--yes"].includes(a));
if (unknown.length) {
  console.error(`Unknown option ${unknown.join(" ")}. Options: --linked, --dry-run, --yes.`);
  process.exit(1);
}
const target = args.includes("--linked") ? "--linked" : "--local";
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--yes") && !dryRun;

// The database's normalize_handle: lowercase, digits read as letters, only
// letters kept, runs of one letter squeezed.
const normalize = (term) =>
  term
    .replace(/[0-9]/g, (d) => ({ 0: "o", 1: "i", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g" })[d])
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");

// The database's normalize_handle_loose: the same, with lookalike letters
// folded together before squeezing.
const normalizeLoose = (term) =>
  term
    .replace(/[0-9]/g, (d) => ({ 0: "o", 1: "i", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g" })[d])
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/vv/g, "w")
    .replace(/[jlycqzv]/g, (ch) => ({ j: "i", l: "i", y: "i", c: "k", q: "k", z: "s", v: "u" })[ch])
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
    console.error(`${FILE}:${i + 1}: expected "<contains|word|name|group|hostile|root|allow> <lowercase letters and digits>"`);
    process.exit(1);
  }
  // A term that is all 2s and 9s reads as nothing, and nothing is in every name.
  if (normalize(term).length < 2) {
    console.error(`${FILE}:${i + 1}: "${term}" is under 2 letters once disguises are undone, so it would block every name.`);
    process.exit(1);
  }
  if (terms.has(term)) console.warn(`${FILE}:${i + 1}: "${term}" is listed twice; keeping ${mode}`);
  terms.set(term, mode);
});
if (!terms.size) {
  console.error(`${FILE} has no terms.`);
  process.exit(1);
}

// A group and a hostile term that share letters, one inside the other or the
// end of one starting the other, would let a single word block itself.
const overlap = (x, y) => {
  if (x.includes(y) || y.includes(x)) return true;
  for (let n = 2; n < Math.min(x.length, y.length); n++) {
    if (x.endsWith(y.slice(0, n)) || y.endsWith(x.slice(0, n))) return true;
  }
  return false;
};
const ofMode = (m) => [...terms].filter(([, mode]) => mode === m).map(([term]) => term);
for (const g of ofMode("group")) {
  for (const h of ofMode("hostile")) {
    if (overlap(normalize(g), normalize(h))) {
      console.error(`${FILE}: group "${g}" and hostile "${h}" overlap, so one word would block itself.`);
      process.exit(1);
    }
  }
}
if (!ofMode("group").length !== !ofMode("hostile").length) {
  console.warn(`${FILE}: group and hostile terms only work in pairs; one of the two lists is empty.`);
}

// An allowed word is blanked out before roots are matched, in both spellings
// a root is matched in (lookalikes folded only for roots of 4 letters or
// more). One that sits inside a root, or reads the same, would unblock it;
// one that overlaps a root's start or end hides part of it; one with no root
// in it does nothing.
const spellings = (root) => {
  const loose = normalizeLoose(root);
  return loose.length >= 4 ? [[normalize(root), normalize], [loose, normalizeLoose]] : [[normalize(root), normalize]];
};
for (const a of ofMode("allow")) {
  let hasRoot = false;
  for (const r of ofMode("root")) {
    for (const [root, read] of spellings(r)) {
      const word = read(a);
      if (root.includes(word)) {
        console.error(`${FILE}: allow "${a}" sits inside root "${r}", so it would unblock it.`);
        process.exit(1);
      }
      if (word.includes(root)) hasRoot = true;
      else if (overlap(word, root)) console.warn(`${FILE}: allow "${a}" overlaps the start or end of root "${r}", which hides part of it.`);
    }
  }
  if (!hasRoot) {
    const kept = ofMode("contains").find((t) => normalize(a).includes(normalize(t)));
    console.warn(
      kept
        ? `${FILE}: allow "${a}" has contains "${kept}" in it, which still blocks it; list "${kept}" as a root instead.`
        : `${FILE}: allow "${a}" has no root in it, so it does nothing.`
    );
  }
}

// Terms are validated as [a-z0-9]+ above, so the JSON is safe to quote
// inline.
const list = JSON.stringify([...terms].map(([term, match]) => ({ term, match })));
const where = target === "--linked" ? "hosted" : "local";

// Runs one statement from a temporary file outside the repository, removed
// straight after: it holds the whole list.
function query(sql) {
  const dir = mkdtempSync(join(tmpdir(), "blocked-names-"));
  const sqlFile = join(dir, "load.sql");
  try {
    writeFileSync(sqlFile, sql);
    return execFileSync("npx", ["supabase", "db", "query", target, "-f", sqlFile], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`What this list would catch in the ${where} database (players are cleared, leagues renamed by hand):`);
console.log(query(`select * from public.preview_blocked_names('${list}'::jsonb);
`));

if (!confirmed) {
  console.log(dryRun ? "Dry run: nothing changed." : "Nothing changed yet. Run again with --yes to load the list.");
} else {
  // One statement: the database swaps the list and clears blocked names
  // atomically.
  const out = query(`select public.replace_blocked_names('${list}'::jsonb) as names_cleared;
`);
  console.log(`Loaded ${terms.size} terms into the ${where} database.`);
  const cleared = out.match(/names_cleared\D*(\d+)/)?.[1];
  if (cleared !== undefined) console.log(`Names cleared: ${cleared}`);
}
