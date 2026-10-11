import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { loadHistory, type History } from "../services/history";
import { onLiveChange } from "../services/liveUpdates";
import { readCache, writeCache } from "../services/screenCache";

type State =
  | { status: "loading" }
  | { status: "ready"; history: History }
  | { status: "error"; message: string };

/** While a card is being fought, scores move every few minutes. */
const LIVE_REFRESH_MS = 60_000;

/** The signed-in user's played events and season total, refreshed whenever
 * the app returns to the foreground, and every minute while a card is live.
 */
export function useHistory(): State & { reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const cacheKey = userId ? `history:${userId}` : null;
  const [state, setState] = useState<State>(() => {
    const cached = readCache<History>(cacheKey);
    return cached ? { status: "ready", history: cached } : { status: "loading" };
  });

  const reload = useCallback(() => {
    if (!userId) return;
    loadHistory(userId)
      .then((history) => setState({ status: "ready", history: writeCache(cacheKey, history) }))
      // Keep what is on screen if a refresh fails.
      .catch((e: Error) => setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: e.message })));
  }, [userId, cacheKey]);

  useEffect(() => {
    reload();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => sub.remove();
  }, [reload]);

  const live = state.status === "ready" && state.history.events.some((e) => e.live || e.provisional);
  useEffect(() => {
    if (!live || !userId) return;
    // Realtime brings changes as they land; the timer is the fallback if it
    // drops.
    const stop = onLiveChange(userId, reload);
    const timer = setInterval(reload, LIVE_REFRESH_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [live, reload, userId]);

  return { ...state, reload };
}
