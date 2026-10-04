import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { loadEventDetail, type EventDetail } from "../services/eventDetail";

type State =
  | { status: "loading" }
  | { status: "ready"; detail: EventDetail | null }
  | { status: "error"; message: string };

/** Results land about a minute after each fight, so poll a little faster. */
const LIVE_REFRESH_MS = 30_000;

/** One card for the signed-in player, refreshed on returning to the app and
 * every 30 seconds while the card is live or its scores can still change.
 */
export function useEventDetail(eventId: string | undefined): State & { reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<State>({ status: "loading" });

  const reload = useCallback(() => {
    if (!userId || !eventId) return;
    loadEventDetail(eventId, userId)
      .then((detail) => setState({ status: "ready", detail }))
      // Keep what is on screen if a refresh fails.
      .catch((e: Error) => setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: e.message })));
  }, [eventId, userId]);

  useEffect(() => {
    reload();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => sub.remove();
  }, [reload]);

  const live = state.status === "ready" && !!state.detail && (state.detail.status === "live" || state.detail.provisional);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(reload, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, reload]);

  return { ...state, reload };
}
