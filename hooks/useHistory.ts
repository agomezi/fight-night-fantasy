import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { loadHistory, type History } from "../services/history";

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
  const [state, setState] = useState<State>({ status: "loading" });

  const reload = useCallback(() => {
    if (!userId) return;
    loadHistory(userId)
      .then((history) => setState({ status: "ready", history }))
      // Keep what is on screen if a refresh fails.
      .catch((e: Error) => setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: e.message })));
  }, [userId]);

  useEffect(() => {
    reload();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => sub.remove();
  }, [reload]);

  const live = state.status === "ready" && state.history.events.some((e) => e.live || e.provisional);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(reload, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, reload]);

  return { ...state, reload };
}
