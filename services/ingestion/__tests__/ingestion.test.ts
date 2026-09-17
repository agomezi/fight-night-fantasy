import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEvent, normalizeMethod } from "../index";

const fixture = (card: number) => readFileSync(join(__dirname, "../__fixtures__", card === 319 ? "ufc-319-dupless-vs-chimaev.html" : `ufc-${card}.html`), "utf8");
const url = (card: number) => `https://www.ufc.com/event/ufc-${card}`;

// Explicit expectations transcribed from saved HTML, not parser snapshots.
// id / winner / method / source round / source time (source round retained for DEC).
const expected: Record<number, string[]> = {
  316: ["12037 red SUB 3 4:42", "12038 blue SUB 2 4:55", "12056 blue DEC 3 5:00", "12141 red DEC 3 5:00", "12063 blue SUB 2 1:03", "12045 blue KO 3 4:01", "12166 red KO 1 3:25", "12143 blue DEC 3 5:00", "12167 blue DEC 3 5:00", "12046 blue DEC 3 5:00", "12118 blue KO 1 0:28", "12119 red DEC 3 5:00", "12168 red DEC 3 5:00"],
  317: ["12120 red KO 1 2:27", "12121 red SUB 3 1:55", "12182 blue DEC 3 5:00", "12122 red DEC 3 5:00", "12196 red DEC 3 5:00", "12125 blue KO 1 4:21", "12197 blue KO 1 0:26", "12127 blue DEC 3 5:00", "12198 red SUB 1 0:55", "12201 blue SUB 2 4:03", "12200 red DEC 3 5:00"],
  318: ["12097 red DEC 5 5:00", "12216 red DEC 3 5:00", "12237 blue DEC 3 5:00", "12228 blue DEC 3 5:00", "12217 red DEC 3 5:00", "12147 blue DEC 3 5:00", "12138 blue DEC 3 5:00", "12236 blue DEC 3 5:00", "12183 red KO 1 1:10", "12140 blue KO 1 4:06", "12145 red SUB 1 4:42", "12239 red SUB 1 2:47", "12238 red SUB 1 3:35", "12146 red KO 3 1:30"],
  319: ["12132 blue DEC 5 5:00", "12295 red KO 1 3:21", "12257 blue KO 1 4:59", "12184 blue DEC 3 5:00", "12190 red SUB 2 4:39", "12345 red SUB 2 2:01", "12185 blue KO 1 3:03", "12192 blue DEC 3 5:00", "12191 blue KO 1 4:58", "12186 blue DEC 3 5:00", "12342 red DEC 3 5:00", "12343 blue SUB 2 3:04"],
};

describe("saved UFC.com cards", () => {
  test.each([316, 317, 318, 319])("every bout in UFC %i has the expected winner, method, round and time", card => {
    const event = parseEvent(fixture(card), url(card));
    expect(event.bouts).toHaveLength(expected[card].length);
    event.bouts.forEach((bout, i) => {
      const [id, corner, method, round, time] = expected[card][i].split(" ");
      expect(bout.sourceBoutId).toBe(id);
      expect(bout.result).toEqual({ status: "scored", winner: { by: "corner", corner }, method, ...(method === "DEC" ? {} : { round: Number(round) }) });
      expect(bout.raw.roundText).toBe(round);
      expect(bout.raw.timeText).toBe(time);
      expect(bout.issues).toBeUndefined();
      expect(bout.fighters.first.id).not.toBe(bout.fighters.second.id);
    });
    expect(parseEvent(fixture(card), url(card))).toEqual(event);
  });
  test("metadata and fighter identity come from HTML, without fetchedAt or images", () => {
    const event = parseEvent(fixture(319), url(319));
    expect(event.name).toBe("UFC 319: Du Plessis vs Chimaev");
    expect(event.date).toBe("2025-08-17T02:00:00.000Z");
    expect(event.sourceEventId).toBe("ufc-319");
    expect(event.provenance).toEqual({ source: "ufc.com", url: url(319) });
    expect(event.bouts[0].fighters).toEqual({ first: { id: "dricus-du-plessis", name: "Dricus Du Plessis" }, second: { id: "khamzat-chimaev", name: "Khamzat Chimaev" } });
    expect(parseEvent(fixture(316), url(316)).bouts[0].fighters.second.name).toBe("Sean O'Malley");
  });
  test("split decision is recognised in the real fixture", () => {
    const bout = parseEvent(fixture(318), url(318)).bouts.find(b => b.sourceBoutId === "12236")!;
    expect(bout.raw.methodText).toBe("Decision - Split");
    expect(bout.result).toEqual({ status: "scored", winner: { by: "corner", corner: "blue" }, method: "DEC" });
  });
});

// Synthetic state variants of the supplied DOM; these are NOT historical results
// or evidence of UFC's live cancellation markup. No page structure is invented.
function editFirst(edit: (html: string) => string): string {
  const html = fixture(319);
  const start = html.indexOf('<div class="c-listing-fight"');
  const end = html.indexOf('<div class="c-listing-fight"', start + 1);
  return html.slice(0, start) + edit(html.slice(start, end)) + html.slice(end);
}
const method = (html: string, value: string) => html.replace(/(result-text method">)[^<]*/g, `$1${value}`);
const clearOutcomes = (html: string) => html.replace(/c-listing-fight__outcome--(?:win|loss)/g, "c-listing-fight__outcome--pending");
const first = (html: string) => parseEvent(html, url(319)).bouts[0];

describe("synthetic in-progress and correction variants", () => {
  test("an unresolved bout stays pending alongside completed fights", () => {
    const html = editFirst(h => clearOutcomes(h).replace(/(result-text (?:method|round|time)"[^>]*>)[^<]*/g, "$1"));
    const event = parseEvent(html, url(319));
    expect(event.bouts[0].result).toEqual({ status: "pending" });
    expect(event.bouts[0].issues).toBeUndefined();
    expect(event.bouts[1].result.status).toBe("scored");
    expect(first(fixture(319)).sourceBoutId).toBe(event.bouts[0].sourceBoutId);
  });
  test.each([['No Contest', 'NC'], ['Cancelled', 'CANCELLED'], ['Draw', 'DRAW'], ['Overturned', 'NC']])("%s becomes void", (label, reason) => {
    const bout = first(editFirst(h => method(clearOutcomes(h), label)));
    expect(bout.result).toEqual({ status: "void", reason });
    expect(bout.raw.methodText).toBe(label);
    expect(bout.sourceBoutId).toBe("12132");
  });
  test("unknown methods preserve whitespace and are flagged, never guessed", () => {
    const bout = first(editFirst(h => method(h, "  Spirit Bomb  ")));
    expect(bout.raw.methodText).toBe("  Spirit Bomb  ");
    expect(bout.result).toEqual({ status: "pending" });
    expect(bout.issues).toEqual(["Unrecognized method:   Spirit Bomb  "]);
  });
  test("a disqualification scores as a decision win, with no round", () => {
    const bout = first(editFirst(h => method(h, "Disqualification")));
    expect(bout.raw.methodText).toBe("Disqualification");
    expect(bout.result).toMatchObject({ status: "scored", method: "DEC" });
    expect(bout.result).not.toHaveProperty("round");
    expect(bout.issues ?? []).toEqual([]);
  });
  test("a winner without a method is unresolved", () => {
    expect(first(editFirst(h => method(h, ""))).issues).toEqual(["Winner present but method is missing"]);
  });
  test("a method without a winner is unresolved", () => {
    expect(first(editFirst(clearOutcomes)).issues).toEqual(["Result has no unique winner"]);
  });
  test("two winners cannot score", () => {
    expect(first(editFirst(h => h.replace(/outcome--loss/g, "outcome--win"))).result).toEqual({ status: "pending" });
  });
  test("finishes require a valid round", () => {
    const bout = first(editFirst(h => method(h, "KO/TKO").replace(/(result-text round">)[^<]*/g, "$10")));
    expect(bout.result).toEqual({ status: "pending" });
    expect(bout.issues).toEqual(["Finish has no valid round"]);
  });
  test("desktop/mobile disagreements are flagged", () => {
    expect(first(editFirst(h => h.replace("Decision - Unanimous", "KO/TKO"))).issues?.[0]).toContain("Conflicting method fields");
  });
  test("missing bouts never imply cancellation", () => {
    const html = fixture(319);
    const start = html.indexOf('<div class="c-listing-fight"');
    const end = html.indexOf('<div class="c-listing-fight"', start + 1);
    const event = parseEvent(html.slice(0, start) + html.slice(end), url(319));
    expect(event.bouts).toHaveLength(11);
    expect(event.bouts.some(b => b.result.status === "void")).toBe(false);
  });
  test("source id survives a fighter substitution; identities expose the change", () => {
    const bout = first(editFirst(h => h.replace(/khamzat-chimaev/g, "replacement-fighter")));
    expect(bout.sourceBoutId).toBe("12132");
    expect(bout.fighters.second.id).toBe("replacement-fighter");
  });
});

describe("method rules", () => {
  test.each(["KO/TKO", "TKO (Punches)", "KO (Head Kick)", "TKO - Doctor’s Stoppage"])("%s => KO", label => expect(normalizeMethod(label)).toEqual({ method: "KO" }));
  test.each(["Submission", "SUB (Rear Naked Choke)", "Technical Submission"])("%s => SUB", label => expect(normalizeMethod(label)).toEqual({ method: "SUB" }));
  test.each(["Decision - Unanimous", "Decision - Split", "Decision - Majority", "Technical Decision", "Disqualification", "DQ"])("%s => DEC", label => expect(normalizeMethod(label)).toEqual({ method: "DEC" }));
  test("could not continue is a no contest", () => expect(normalizeMethod("Could Not Continue")).toEqual({ voidReason: "NC" }));
  test("does not guess from keywords embedded in prose", () => expect(normalizeMethod("Not a Submission")).toHaveProperty("issue"));
});

describe("structural failures", () => {
  test("blocked or empty pages fail loudly", () => expect(() => parseEvent("<h1>Access denied</h1>", url(319))).toThrow());
  test("Sherdog is not guessed without fixtures", () => expect(() => parseEvent(fixture(319), "https://www.sherdog.com/events/example")).toThrow("Unsupported source"));
  test("a missing identity does not get a fabricated id", () => expect(() => first(editFirst(h => h.replace('data-fmid="12132"', 'data-fmid=""')))).toThrow("Missing UFC bout id"));
  test("duplicate ids fail loudly", () => expect(() => parseEvent(fixture(319).replace('data-fmid="12295"', 'data-fmid="12132"'), url(319))).toThrow("Duplicate UFC bout ids"));
});
