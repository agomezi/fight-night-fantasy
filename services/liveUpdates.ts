// Hears new scores and results the moment they're written (Supabase
// Realtime), so a live screen updates with the push notification instead of
// on its next timed refresh. The database only sends a player their own
// scores; results are public.

import { supabase } from "./supabase";

/** A scoring pass writes many rows at once; this waits for it to settle. */
const SETTLE_MS = 1500;

let channels = 0;

/**
 * Calls `onChange` shortly after any of `userId`'s scores or any result
 * changes. Returns a function that stops listening.
 */
export function onLiveChange(userId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, SETTLE_MS);
  };

  const channel = supabase
    .channel(`live:${userId}:${++channels}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `user_id=eq.${userId}` }, settle)
    .on("postgres_changes", { event: "*", schema: "public", table: "results" }, settle)
    .subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
