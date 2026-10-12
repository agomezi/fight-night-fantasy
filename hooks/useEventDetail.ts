import { useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadEventDetail, type EventDetail } from "../services/eventDetail";
import { readCache, writeCache } from "../services/screenCache";
import { useLiveRefresh } from "./useLiveRefresh";

type State =
  | { status: "loading" }
  | { status: "ready"; detail: EventDetail | null }
  | { status: "error"; message: string };

/** Results land about a minute after each fight, so poll a little faster. */
const LIVE_REFRESH_MS = 30_000;

/** One card for the signed-in player, refreshed while in view (see
 * useLiveRefresh), every 30 seconds while the card is live or its scores can
 * still change.
 */
export function useEventDetail(eventId: string | undefined): State & { reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const cacheKey = userId && eventId ? `event:${userId}:${eventId}` : null;
  const [state, setState] = useState<State>(() => {
    const cached = readCache<EventDetail | null>(cacheKey);
    return cached === undefined ? { status: "loading" } : { status: "ready", detail: cached };
  });

  const reload = useCallback(() => {
    if (!userId || !eventId) return;
    loadEventDetail(eventId, userId)
      .then((detail) => setState({ status: "ready", detail: writeCache(cacheKey, detail) }))
      // Keep what is on screen if a refresh fails.
      .catch((e: Error) => setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: e.message })));
  }, [eventId, userId, cacheKey]);

  const live = state.status === "ready" && !!state.detail && (state.detail.status === "live" || state.detail.provisional);
  useLiveRefresh(reload, live, LIVE_REFRESH_MS);

  return { ...state, reload };
}
