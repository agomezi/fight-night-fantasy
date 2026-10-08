// The in-app inbox: every notification sent to you, worded exactly as the
// push was, and where tapping one goes. The shaping is pure so it can be
// tested without a database.

import type { Href } from "expo-router";
import { notificationText, type NotificationKind } from "./notificationText";

export type InboxItem = {
  key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  sentAt: Date;
  read: boolean;
  /** Where tapping it goes, or null when it goes nowhere. */
  href: Href | null;
};

export type RawInboxItem = { kind: NotificationKind; key: string; payload: unknown; sent_at: string; read: boolean };

const SCREENS = new Set(["history", "picks", "edit-profile"]);

/** Where a notification's data points. Shared by push taps and the inbox. */
export function notificationHref(data: unknown): Href | null {
  const { screen, leagueId } = (data ?? {}) as { screen?: unknown; leagueId?: unknown };
  if (screen === "league-standings" && typeof leagueId === "string" && leagueId) {
    return `/league-standings?id=${encodeURIComponent(leagueId)}`;
  }
  return typeof screen === "string" && SCREENS.has(screen) ? (`/${screen}` as Href) : null;
}

export function toInbox(raw: RawInboxItem[]): InboxItem[] {
  return raw.map((r) => {
    const { title, body, data } = notificationText(r.kind, r.payload);
    return { key: `${r.kind}:${r.key}`, kind: r.kind, title, body, sentAt: new Date(r.sent_at), read: r.read, href: notificationHref(data) };
  });
}

/** "now", "5m", "3h", "2d", then a date. */
export function timeAgo(at: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadInbox(maxRows = 50): Promise<InboxItem[]> {
  const { data, error } = await (await db()).rpc("my_notifications", { max_rows: maxRows });
  if (error) throw new Error(error.message);
  return toInbox((data ?? []) as RawInboxItem[]);
}

export async function loadUnreadCount(): Promise<number> {
  const { data, error } = await (await db()).rpc("unread_notification_count");
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

export async function markAllRead(): Promise<void> {
  const { error } = await (await db()).rpc("mark_notifications_read");
  if (error) throw new Error(error.message);
}
