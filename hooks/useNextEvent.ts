import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetchNextEvent, type NextEvent } from "../services/events";
import { readCache, writeCache } from "../services/screenCache";

const CACHE_KEY = "next-event";

type State =
  | { status: "loading" }
  | { status: "ready"; event: NextEvent | null }
  | { status: "error"; message: string };

/** The next card from Supabase, refreshed whenever the app returns to the
 * foreground, plus a clock that ticks each minute for countdowns.
 */
export function useNextEvent(): State & { now: Date; reload: () => void } {
  const [state, setState] = useState<State>(() => {
    const cached = readCache<NextEvent | null>(CACHE_KEY);
    return cached === undefined ? { status: "loading" } : { status: "ready", event: cached };
  });
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(() => {
    fetchNextEvent()
      .then((event) => setState({ status: "ready", event: writeCache(CACHE_KEY, event) }))
      // Keep showing a card already on screen if a refresh fails.
      .catch((e: Error) => setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: e.message })));
  }, []);

  useEffect(() => {
    reload();
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        setNow(new Date());
        reload();
      }
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [reload]);

  return { ...state, now, reload };
}
