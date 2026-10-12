import { useIsFocused } from "@react-navigation/native";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "../context/AuthContext";
import { onLiveChange } from "../services/liveUpdates";

/**
 * Keeps a screen's data fresh while it is the one in view: `reload` runs when
 * the screen comes into view and when the app returns to the foreground, and
 * while `live` it also runs as new scores land (Realtime), with a timer every
 * `liveRefreshMs` as the fallback if that drops.
 *
 * A screen left underneath in the stack does none of this until it comes back
 * into view, so screens you have passed through don't keep loading and
 * holding Realtime channels behind the one you're looking at.
 */
export function useLiveRefresh(reload: () => unknown, live: boolean, liveRefreshMs: number) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused) return;
    reload();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => sub.remove();
  }, [focused, reload]);

  useEffect(() => {
    if (!focused || !live || !userId) return;
    const stop = onLiveChange(userId, reload);
    const timer = setInterval(reload, liveRefreshMs);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [focused, live, liveRefreshMs, reload, userId]);
}
