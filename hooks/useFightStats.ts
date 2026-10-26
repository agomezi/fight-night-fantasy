import { useCallback, useEffect, useRef, useState } from "react";
import { loadBoutStats, type BoutStats } from "../services/fightStats";
import { useLiveRefresh } from "./useLiveRefresh";

type State =
  | { status: "loading" }
  | { status: "ready"; stats: BoutStats | null }
  | { status: "error"; message: string };

type Held = { boutId: string | null; state: State };

/** The results sync reads stats every 10 seconds while a fight is on. */
const LIVE_REFRESH_MS = 12_000;

/** One bout's stats, refreshed while in view and the fight is in the cage
 * (`inCage`, from the card) or its numbers aren't official yet. Pass null to
 * load nothing (sheet closed). */
export function useFightStats(boutId: string | null, inCage: boolean): State {
  // Held with the bout it belongs to, so switching bouts never shows the last
  // one's numbers, not even for a frame.
  const [held, setHeld] = useState<Held>({ boutId, state: { status: "loading" } });
  const current = useRef(boutId);
  useEffect(() => {
    current.current = boutId;
  }, [boutId]);

  const reload = useCallback(() => {
    if (!boutId) return;
    loadBoutStats(boutId)
      .then((stats) => current.current === boutId && setHeld({ boutId, state: { status: "ready", stats } }))
      // Keep what is on screen if a refresh fails.
      .catch((e: Error) =>
        current.current === boutId &&
        setHeld((prev) =>
          prev.boutId === boutId && prev.state.status === "ready" ? prev : { boutId, state: { status: "error", message: e.message } },
        ),
      );
  }, [boutId]);

  const state: State = held.boutId === boutId ? held.state : { status: "loading" };
  const stats = state.status === "ready" ? state.stats : null;
  const live = !!boutId && (inCage || (stats != null && (stats.live || !stats.official)));
  useLiveRefresh(reload, live, LIVE_REFRESH_MS);

  return state;
}
