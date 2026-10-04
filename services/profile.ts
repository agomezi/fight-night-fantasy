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

export async function fetchDisplayName(userId: string): Promise<string | null> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.display_name as string | null | undefined) ?? null;
}

export class HandleBlockedError extends Error {
  constructor() {
    super("That name isn't allowed.");
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
  if (error) throw new Error(error.message);
}
