// Picks being edited but not yet locked in.
//
// The picks screen unmounts when you navigate away, and both it and home
// reload what's saved on the server when they come back. Without a draft,
// any edit you hadn't locked in (a pick cleared, a fighter switched) was
// silently replaced by the saved card. The draft holds those edits until
// you lock in, and is kept on the device so closing the app doesn't lose
// them either.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LanePick } from "../components/RoundLane";
import { pickDraftKey } from "../constants/storage";

// What's known this session. null means "no draft", so a read from storage
// still in flight can't bring back one that was cleared meanwhile.
const drafts = new Map<string, Record<string, LanePick> | null>();

const key = (userId: string, eventId: string) => `${userId}:${eventId}`;

/** The unsaved draft for this card, if any, read from the device the first time. */
export async function loadDraft(userId: string, eventId: string): Promise<Record<string, LanePick> | undefined> {
  const k = key(userId, eventId);
  if (!drafts.has(k)) {
    let stored: Record<string, LanePick> | null = null;
    try {
      const raw = await AsyncStorage.getItem(pickDraftKey(userId, eventId));
      stored = raw ? JSON.parse(raw) : null;
    } catch {}
    // An edit or a lock-in while reading wins over what was stored.
    if (!drafts.has(k)) drafts.set(k, stored);
  }
  return drafts.get(k) ?? undefined;
}

export function setDraft(userId: string, eventId: string, picks: Record<string, LanePick>): void {
  drafts.set(key(userId, eventId), picks);
  AsyncStorage.setItem(pickDraftKey(userId, eventId), JSON.stringify(picks)).catch(() => {});
}

export function clearDraft(userId: string, eventId: string): void {
  drafts.set(key(userId, eventId), null);
  AsyncStorage.removeItem(pickDraftKey(userId, eventId)).catch(() => {});
}

/** Forgets what this session knows, as a fresh app launch would. For tests. */
export function resetDraftCache(): void {
  drafts.clear();
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
