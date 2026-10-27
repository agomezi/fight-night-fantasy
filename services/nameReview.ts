// A name hidden by reports: others see "Player #4821" until a moderator
// looks, and the player can pick a new name on the spot. The copy is pure so
// it can be tested without a database.

import { HandleBlockedError, handleProblem, HandleTakenError, HandleTooSoonError } from "./profile";

export type NameReview = {
  /** Others see the tag instead of your name. */
  hidden: boolean;
  /** The number in the tag, while a case is open. */
  alias: number | null;
  /** You've picked a new name since it was hidden. */
  renamed: boolean;
};

/** The tag others see while a name is hidden. */
export function hiddenTag(alias: number | null): string {
  return alias ? `Player #${alias}` : "Player";
}

/** Whether Home offers the rename: hidden, not renamed, and not put off for this case. */
export function shouldOfferRename(review: NameReview | null, skippedAlias: number | null): boolean {
  return !!review && review.hidden && !review.renamed && review.alias !== skippedAlias;
}

export function nameReviewCopy(alias: number | null) {
  return {
    eyebrow: "NAME UNDER REVIEW",
    title: "Your name is under review",
    body: `A few players reported it, so others see you as ${hiddenTag(alias)}. Pick a new name now and everyone sees it straight away. If a moderator finds your old name was fine, you'll get it back.`,
    action: "CHANGE NAME",
    skip: "Keep it for now",
  };
}

/** The message for a rename that didn't go through. */
export function renameErrorMessage(e: unknown): string {
  if (e instanceof HandleTakenError) return "That name is taken. Try another one.";
  if (e instanceof HandleBlockedError) return "That name isn't allowed. Pick another one.";
  if (e instanceof HandleTooSoonError) return "You've already changed your name this week.";
  return e instanceof Error ? e.message : "Couldn't save your name. Please try again.";
}

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

async function db() {
  return (await import("./supabase")).supabase;
}

export async function loadNameReview(): Promise<NameReview> {
  const { data, error } = await (await db()).rpc("my_name_review");
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { hidden?: boolean; alias?: number | null; renamed?: boolean } | null;
  return { hidden: !!row?.hidden, alias: row?.alias ?? null, renamed: !!row?.renamed };
}

/** Renames you while your name is hidden; the first time skips the weekly limit. */
export async function renameUnderReview(name: string): Promise<void> {
  const problem = handleProblem(name);
  if (problem) throw new Error(problem);
  const { error } = await (await db()).rpc("rename_under_review", { name });
  if (error?.code === "23505") throw new HandleTakenError();
  if (error?.hint === "blocked") throw new HandleBlockedError();
  if (error?.hint === "too_soon") throw new HandleTooSoonError(error.details ? new Date(error.details) : null);
  if (error) throw new Error(error.message);
}
