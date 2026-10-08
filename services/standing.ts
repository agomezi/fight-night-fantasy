// Whether the signed-in player is in good standing, and how to say so when
// they aren't. The wording is pure so it can be tested without a database.

import { SUPPORT_EMAIL } from "./notificationText";

export type Standing = { standing: "active" | "suspended" | "banned"; until: Date | null };

export const ACTIVE: Standing = { standing: "active", until: null };

export const BANNED_TITLE = "Account banned";
export const BANNED_MESSAGE = `This account has been banned for breaking our rules. Think this is a mistake? Email ${SUPPORT_EMAIL}.`;

function day(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The banner shown while suspended, or null in good standing. */
export function suspendedBanner(s: Standing): string | null {
  if (s.standing !== "suspended") return null;
  return s.until ? `Suspended until ${day(s.until)}` : "Suspended";
}

/** Why a suspended player can't do something, in a line. */
export function suspendedReason(s: Standing): string | null {
  if (s.standing !== "suspended") return null;
  const until = s.until ? ` until ${day(s.until)}` : "";
  return `Your account is suspended${until}. You can look around, but can't make picks, join or create leagues, or report players until then.`;
}

/** Sign-in's own error for a banned account, said plainly. Anything else is
 * passed through. */
export function signInError(message: string): { title: string; message: string } {
  if (/banned/i.test(message)) return { title: BANNED_TITLE, message: BANNED_MESSAGE };
  return { title: "Sign in failed", message };
}

export async function loadStanding(): Promise<Standing> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("my_standing");
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as { standing: Standing["standing"]; until: string | null }[])[0];
  return row ? { standing: row.standing, until: row.until ? new Date(row.until) : null } : ACTIVE;
}
