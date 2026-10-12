// Who moved up or down the league table, worked out on the phone: the ranks
// as they stood before the latest card are kept, and each player's rank now is
// compared with them. Pure, so the storage around it stays thin.

/** Each ranked player's rank, by user id. */
export type Ranks = Record<string, number>;

export type RankSnapshot = {
  /** How many of the league's weeks were final when this was taken. */
  finals: number;
  /** The table before the next card: what a live card is measured against. */
  base: Ranks;
  /** The table before the last card, once one has finished. */
  prev: Ranks | null;
};

/** Places climbed since `before`: positive moved up, negative down. Only
 * players ranked both times are included. */
function compare(before: Ranks | null, now: Ranks): Record<string, number> {
  const moves: Record<string, number> = {};
  if (!before) return moves;
  for (const [id, rank] of Object.entries(now)) {
    if (before[id] != null) moves[id] = before[id] - rank;
  }
  return moves;
}

/**
 * The movement to show and the snapshot to keep. While a card is live the
 * table is measured against how it stood before the card; once it is over,
 * against how it stood before that card, until the next one starts.
 */
export function trackMoves(
  stored: RankSnapshot | null,
  now: Ranks,
  finals: number,
  live: boolean
): { snapshot: RankSnapshot; moves: Record<string, number> } {
  // First look, or a new season started the weeks over.
  if (!stored || finals < stored.finals) {
    return { snapshot: { finals, base: now, prev: null }, moves: {} };
  }
  if (live) return { snapshot: stored, moves: compare(stored.base, now) };
  if (finals > stored.finals) {
    const snapshot = { finals, base: now, prev: stored.base };
    return { snapshot, moves: compare(snapshot.prev, now) };
  }
  return { snapshot: { ...stored, base: now }, moves: compare(stored.prev, now) };
}
