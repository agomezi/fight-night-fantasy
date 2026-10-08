// The player's handle, stored on their Supabase profile. Validation is pure
// so it can be tested without a database; the server enforces the same rule
// and uniqueness.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Why a handle can't be used, or null when it is well-formed. */
export function handleProblem(name: string): string | null {
  if (name.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`;
  if (name.length > HANDLE_MAX) return `${HANDLE_MAX} characters at most.`;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return "Letters, numbers and underscores only.";
  return null;
}

/** Spaces become underscores and anything else not allowed is dropped, so
 * typing "Alex G" gives "Alex_G" instead of an error.
 */
export function cleanHandle(input: string): string {
  return input.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").slice(0, HANDLE_MAX);
}

export class HandleTakenError extends Error {
  constructor() {
    super("That name is taken.");
  }
}

/** A handle can be changed once every 7 days; the first one is free. */
export const NAME_CHANGE_DAYS = 7;

/** When a handle set at `changedAt` can next be changed, or null if it can now. */
export function nextNameChange(changedAt: Date | null, now: Date = new Date()): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + NAME_CHANGE_DAYS * 24 * 60 * 60 * 1000);
  return next.getTime() > now.getTime() ? next : null;
}

export async function fetchDisplayName(
  userId: string
): Promise<{ name: string | null; changedAt: Date | null; favDivision: string | null }> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, name_changed_at, fav_division")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    name: (data?.display_name as string | null | undefined) ?? null,
    changedAt: data?.name_changed_at ? new Date(data.name_changed_at as string) : null,
    favDivision: (data?.fav_division as string | null | undefined) ?? null,
  };
}

/** Saves the favorite division league mates see on your profile. */
export async function saveFavDivision(userId: string, division: string): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.from("profiles").update({ fav_division: division }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export class HandleBlockedError extends Error {
  constructor() {
    super("That name isn't allowed.");
  }
}

export class HandleTooSoonError extends Error {
  constructor(readonly nextChange: Date | null) {
    super("You can change your name once a week.");
  }
}

export type HandleStatus = "free" | "taken" | "blocked" | "invalid";

/** Whether a handle can be used, and if not, why. */
export async function handleStatus(name: string): Promise<HandleStatus> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("display_name_status", { name });
  if (error) throw new Error(error.message);
  return data as HandleStatus;
}

export async function saveDisplayName(userId: string, name: string): Promise<void> {
  const problem = handleProblem(name);
  if (problem) throw new Error(problem);
  const { supabase } = await import("./supabase");
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error?.code === "23505") throw new HandleTakenError();
  if (error?.hint === "blocked") throw new HandleBlockedError();
  if (error?.hint === "too_soon") throw new HandleTooSoonError(error.details ? new Date(error.details) : null);
  if (error) throw new Error(error.message);
}
