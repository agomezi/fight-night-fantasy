// Matching card fighters to API-Sports fighters, for their licensed photos.
// Pure and dependency-free, so the sync Edge Function imports it under Deno.
//
// Matching is per bout, not per name: a card fighter is only matched when the
// API-Sports fight on the same date has both of the bout's fighters. Two
// fighters sharing a surname on one card cannot be swapped that way, and a
// wrong face on a fighter is worse than no face.

export type CardPair = {
  red: { ufcFighterId: string; name: string };
  blue: { ufcFighterId: string; name: string };
};
export type PhotoMatch = { ufcFighterId: string; apisportsFighterId: number; photoUrl: string };

type ApiFighter = { id: number; name: string; photo: string | null };

// Letters that do not decompose into a base letter plus an accent.
const LETTERS: Record<string, string> = { ł: "l", ø: "o", đ: "d", ß: "ss", æ: "ae", œ: "oe", ı: "i" };

/** Lowercase ASCII words, without accents, punctuation or generational suffixes. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[łøđßæœı]/g, (c) => LETTERS[c])
    // "Da'Mon" and "DaMon" are the same name.
    .replace(/['’`.]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w))
    .join(" ");
}

/** Same person under either source's spelling: full names equal, or the same
 * surname with the same first initial ("Alex Pereira" / "Alexandre Pereira").
 */
export function sameFighter(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = x.split(" ");
  const ys = y.split(" ");
  return xs.length > 1 && ys.length > 1 && xs[xs.length - 1] === ys[ys.length - 1] && xs[0][0] === ys[0][0];
}

function apiFighter(value: unknown): ApiFighter | null {
  if (!value || typeof value !== "object") return null;
  const f = value as Record<string, unknown>;
  if (typeof f.id !== "number" || typeof f.name !== "string") return null;
  // The fights endpoint calls the headshot `logo`, as API-Sports does for
  // every sport's competitors; accept `photo` and `image` too.
  const photo = [f.logo, f.photo, f.image].find((u) => typeof u === "string" && /^https:\/\//.test(u)) as string | undefined;
  return { id: f.id, name: f.name, photo: photo ?? null };
}

/** Pairs from an API-Sports `fights?date=` response. Malformed entries are skipped. */
export function apiPairs(payload: unknown): [ApiFighter, ApiFighter][] {
  const response = payload && typeof payload === "object" ? (payload as Record<string, unknown>).response : null;
  if (!Array.isArray(response)) return [];
  const pairs: [ApiFighter, ApiFighter][] = [];
  for (const fight of response) {
    const fighters = fight && typeof fight === "object" ? (fight as Record<string, unknown>).fighters : null;
    if (!fighters || typeof fighters !== "object") continue;
    const first = apiFighter((fighters as Record<string, unknown>).first);
    const second = apiFighter((fighters as Record<string, unknown>).second);
    if (first && second) pairs.push([first, second]);
  }
  return pairs;
}

/** Photos for the card fighters that can be matched with confidence. */
export function matchPhotos(bouts: CardPair[], payload: unknown): PhotoMatch[] {
  const pairs = apiPairs(payload);
  const matches: PhotoMatch[] = [];
  for (const bout of bouts) {
    // Exactly one API fight must hold this bout, in either corner order.
    const found = pairs.flatMap(([a, b]) =>
      sameFighter(bout.red.name, a.name) && sameFighter(bout.blue.name, b.name)
        ? [[a, b] as const]
        : sameFighter(bout.red.name, b.name) && sameFighter(bout.blue.name, a.name)
          ? [[b, a] as const]
          : [],
    );
    if (found.length !== 1) continue;
    const [red, blue] = found[0];
    for (const [card, api] of [[bout.red, red], [bout.blue, blue]] as const) {
      if (api.photo) matches.push({ ufcFighterId: card.ufcFighterId, apisportsFighterId: api.id, photoUrl: api.photo });
    }
  }
  return matches;
}
