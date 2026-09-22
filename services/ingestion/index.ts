import { parse, type DefaultTreeAdapterMap } from "parse5";

export interface Fetcher { get(url: string): Promise<string>; }
export type Corner = "red" | "blue";
export type Winner = { by: "corner"; corner: Corner } | { by: "fighter"; fighterId: string };
export type ResultMethod = "KO" | "SUB" | "DEC";
export type VoidReason = "NC" | "DRAW" | "CANCELLED" | "FIGHTER_CHANGED";
export type BoutResult =
  | { status: "scored"; winner: Winner; method: ResultMethod; round?: number }
  | { status: "void"; reason: VoidReason }
  | { status: "pending" };
export type IngestedBout = {
  sourceBoutId: string;
  /** UFC adapter: first is explicitly red, second explicitly blue. */
  fighters: { first: { id: string; name: string }; second: { id: string; name: string } };
  result: BoutResult;
  /** Decoded source text, including its whitespace, without normalisation. */
  raw: { methodText: string; roundText: string; timeText: string };
  /** Pending plus issues means unresolved data, not an ordinary scheduled bout. */
  issues?: string[];
};
export type IngestedEvent = {
  sourceEventId: string;
  name: string;
  date: string;
  bouts: IngestedBout[];
  provenance: { source: string; url: string };
};

/** Method rulings. Set a value to null to hold that method for review instead.
 * Frozen so parsing does not depend on mutable runtime configuration.
 *
 * doctorsStoppage -> KO: a doctor's stoppage is officially recorded as a TKO,
 *   so it is a finish like any other.
 * technicalDecision -> DEC: still decided on the scorecards.
 * disqualification -> DEC: someone won and it was not a finish, so the winner
 *   earns method credit. Note the round is dropped — a DQ usually ends inside a
 *   round, but DEC carries no round by contract, and losing the round is a
 *   smaller cost than voiding a bout that had a real winner.
 */
export const METHOD_RULINGS: Readonly<{
  doctorsStoppage: "KO" | null;
  technicalDecision: "DEC" | null;
  disqualification: "DEC" | null;
}> = Object.freeze({ doctorsStoppage: "KO", technicalDecision: "DEC", disqualification: "DEC" });

type Normalized = { method: ResultMethod } | { voidReason: VoidReason } | { issue: string };
export function normalizeMethod(raw: string): Normalized {
  const value = raw.trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (/^(no contest|nc|could not continue|overturned)$/i.test(value)) return { voidReason: "NC" };
  if (/^(?:draw(?:\s*[-(].*)?|(?:technical|unanimous|split|majority) draw)$/i.test(value)) return { voidReason: "DRAW" };
  if (/^cancelled$|^canceled$/i.test(value)) return { voidReason: "CANCELLED" };
  if (/^(?:(?:KO\/TKO|KO|TKO)\s*[-(]\s*)?doctor'?s? stoppage\)?$/i.test(value)) {
    return METHOD_RULINGS.doctorsStoppage ? { method: METHOD_RULINGS.doctorsStoppage } : { issue: "Doctor's stoppage needs a ruling" };
  }
  if (/^technical decision(?:\s*[-(].*)?$/i.test(value)) {
    return METHOD_RULINGS.technicalDecision ? { method: METHOD_RULINGS.technicalDecision } : { issue: "Technical decision needs a ruling" };
  }
  if (/^(?:disqualification|dq)(?:\s*[-(].*)?$/i.test(value)) {
    return METHOD_RULINGS.disqualification ? { method: METHOD_RULINGS.disqualification } : { issue: "Disqualification needs a ruling" };
  }
  if (/^(?:KO\/TKO|KO|TKO)(?:\s*\([^)]*\))?$/i.test(value)) return { method: "KO" };
  if (/^(?:submission|sub|technical submission)(?:\s*\([^)]*\))?$/i.test(value)) return { method: "SUB" };
  if (/^(?:decision(?:\s*-\s*(?:unanimous|split|majority))?|(?:unanimous|split|majority) decision)$/i.test(value)) return { method: "DEC" };
  return { issue: `Unrecognized method: ${raw}` };
}

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function elements(node: Node): Element[] {
  const children = "childNodes" in node ? node.childNodes.flatMap(elements) : [];
  return "tagName" in node ? [node, ...children] : children;
}
function attr(node: Element, key: string): string {
  return node.attrs.find(a => a.name === key)?.value ?? "";
}
function hasClass(node: Element, value: string): boolean {
  return attr(node, "class").split(/\s+/).includes(value);
}
function text(node: Node): string {
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(text).join("") : "";
}
function required(nodes: Element[], className: string): Element {
  const node = nodes.find(n => hasClass(n, className));
  if (!node) throw new Error(`Missing UFC element: ${className}`);
  return node;
}
function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }

function parseBout(node: Element): IngestedBout {
  const nodes = elements(node);
  const sourceBoutId = attr(node, "data-fmid");
  if (!sourceBoutId) throw new Error("Missing UFC bout id");
  function fighter(corner: Corner) {
    const nameNode = required(nodes, `c-listing-fight__corner-name--${corner}`);
    const link = elements(nameNode).find(n => n.tagName === "a");
    const path = link && new URL(attr(link, "href"), "https://www.ufc.com").pathname;
    const id = path?.match(/^\/athlete\/([^/]+)\/?$/)?.[1];
    const name = clean(text(nameNode));
    if (!id || !name) throw new Error(`Missing fighter identity in bout ${sourceBoutId}`);
    return { id, name };
  }
  const issues: string[] = [];
  function field(key: string): string {
    const matches = nodes.filter(n => hasClass(n, "c-listing-fight__result-text") && hasClass(n, key));
    if (!matches.length) throw new Error(`Missing UFC result field: ${key}`);
    const values = matches.map(text);
    if (new Set(values.map(clean)).size > 1) issues.push(`Conflicting ${key} fields: ${JSON.stringify(values)}`);
    return values[0];
  }
  const raw = { methodText: field("method"), roundText: field("round"), timeText: field("time") };
  const fighters = { first: fighter("red"), second: fighter("blue") };
  if (fighters.first.id === fighters.second.id) throw new Error(`Duplicate fighter in bout ${sourceBoutId}`);
  const winners = (["red", "blue"] as const).filter(corner =>
    elements(required(nodes, `c-listing-fight__corner--${corner}`)).some(n => hasClass(n, "c-listing-fight__outcome--win"))
  );
  let result: BoutResult = { status: "pending" };
  if (raw.methodText.trim()) {
    const normalized = normalizeMethod(raw.methodText);
    if ("issue" in normalized) issues.push(normalized.issue);
    else if ("voidReason" in normalized) result = { status: "void", reason: normalized.voidReason };
    else if (winners.length !== 1) issues.push("Result has no unique winner");
    else if (normalized.method === "DEC") result = { status: "scored", winner: { by: "corner", corner: winners[0] }, method: "DEC" };
    else if (!/^[1-5]$/.test(raw.roundText.trim())) issues.push("Finish has no valid round");
    else result = { status: "scored", winner: { by: "corner", corner: winners[0] }, method: normalized.method, round: Number(raw.roundText.trim()) };
  } else if (winners.length) issues.push("Winner present but method is missing");
  if (issues.length) result = { status: "pending" };
  return { sourceBoutId, fighters, result, raw, ...(issues.length ? { issues } : {}) };
}

/** Pure UFC.com HTML adapter. A future Sherdog adapter requires saved fixtures.
 * Missing structural identity fails loudly; uncertain results remain pending.
 */
export function parseEvent(html: string, url: string): IngestedEvent {
  const parsedUrl = new URL(url);
  if (!["ufc.com", "www.ufc.com"].includes(parsedUrl.hostname) || !/^https?:$/.test(parsedUrl.protocol)) throw new Error("Unsupported source; only UFC.com fixtures are supported");
  const sourceEventId = parsedUrl.pathname.match(/^\/event\/([^/]+)\/?$/)?.[1];
  if (!sourceEventId) throw new Error("Expected UFC event URL");
  const nodes = elements(parse(html));
  const name = clean(text(required(nodes, "c-hero__headline-prefix"))) + ": " + clean(text(required(nodes, "c-hero__headline")));
  const timestamp = attr(required(nodes, "c-hero__headline-suffix"), "data-timestamp");
  if (!/^\d{10}$/.test(timestamp)) throw new Error("Missing UFC event timestamp");
  // Converts source epoch, never reads the current time.
  const date = new Date(Number(timestamp) * 1000).toISOString();
  const bouts = nodes.filter(n => hasClass(n, "c-listing-fight")).map(parseBout);
  if (!bouts.length) throw new Error("No UFC bouts found; page may be incomplete or blocked");
  if (new Set(bouts.map(b => b.sourceBoutId)).size !== bouts.length) throw new Error("Duplicate UFC bout ids");
  return { sourceEventId, name, date, bouts, provenance: { source: "ufc.com", url } };
}
