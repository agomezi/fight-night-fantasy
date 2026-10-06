// Picks being edited but not yet locked in.
//
// The picks screen unmounts when you navigate away, and both it and home
// reload what's saved on the server when they come back. Without a draft,
// any edit you hadn't locked in (a pick cleared, a fighter switched) was
// silently replaced by the saved card. The draft holds those edits until
// you lock in, for as long as the app stays open.

import type { LanePick } from "../components/RoundLane";

const drafts = new Map<string, Record<string, LanePick>>();

const key = (userId: string, eventId: string) => `${userId}:${eventId}`;

export function getDraft(userId: string, eventId: string): Record<string, LanePick> | undefined {
  return drafts.get(key(userId, eventId));
}

export function setDraft(userId: string, eventId: string, picks: Record<string, LanePick>): void {
  drafts.set(key(userId, eventId), picks);
}

export function clearDraft(userId: string, eventId: string): void {
  drafts.delete(key(userId, eventId));
}

/** Whether two cards hold the same picks, bout for bout. */
export function samePicks(a: Record<string, LanePick>, b: Record<string, LanePick>): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return false;
    if (x.corner !== y.corner || x.finish !== y.finish || (x.method ?? null) !== (y.method ?? null)) return false;
  }
  return true;
}

/**
 * The card to show: the draft for bouts still open, and what's saved for
 * bouts that have locked, since a locked bout's saved pick is what counts.
 */
export function withDraft(
  saved: Record<string, LanePick>,
  draft: Record<string, LanePick> | undefined,
  openBoutIds: string[]
): Record<string, LanePick> {
  if (!draft) return saved;
  const open = new Set(openBoutIds);
  const merged: Record<string, LanePick> = {};
  for (const [id, pick] of Object.entries(saved)) if (!open.has(id)) merged[id] = pick;
  for (const [id, pick] of Object.entries(draft)) if (open.has(id)) merged[id] = pick;
  return merged;
}
