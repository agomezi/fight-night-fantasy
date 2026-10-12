import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useState } from "react";
import { selectedLeagueKey } from "../constants/storage";
import { useAuth } from "../context/AuthContext";
import {
  loadMyLeagues,
  loadStandings,
  loadWeeks,
  type LeagueStandings,
  type MyLeague,
  type Week,
} from "../services/leagues";
import { readCache, writeCache } from "../services/screenCache";
import { useLiveRefresh } from "./useLiveRefresh";

type Ready = {
  status: "ready";
  leagues: MyLeague[];
  /** Null when you are in no league. */
  league: MyLeague | null;
  standings: LeagueStandings | null;
  weeks: Week[];
};

type State = { status: "loading" } | { status: "error"; message: string } | Ready;

/** While a card is being fought, scores move every few minutes. */
const LIVE_REFRESH_MS = 60_000;

/**
 * Your leagues and the one on screen: `leagueId` when a screen was opened for
 * a particular league, otherwise the one you last looked at, otherwise your
 * first. Refreshed while in view (see useLiveRefresh), every minute while a
 * card is live.
 */
export function useLeague(leagueId?: string) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The Leagues tab (no id) shows whichever league you last chose.
  const cacheKey = userId ? `league:${userId}:${leagueId ?? "tab"}` : null;
  const [state, setState] = useState<State>(() => readCache<Ready>(cacheKey) ?? { status: "loading" });

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const leagues = await loadMyLeagues();
      let stored: string | null = null;
      try {
        stored = await AsyncStorage.getItem(selectedLeagueKey(userId));
      } catch {}
      const league =
        leagues.find((l) => l.id === leagueId) ??
        leagues.find((l) => l.id === stored) ??
        leagues[0] ??
        null;
      const [standings, weeks] = league
        ? await Promise.all([loadStandings(league.id), loadWeeks(league.id, userId)])
        : [null, []];
      setState(writeCache<Ready>(cacheKey, { status: "ready", leagues, league, standings, weeks }));
    } catch (e) {
      // Keep what is on screen if a refresh fails.
      setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: (e as Error).message }));
    }
  }, [userId, leagueId, cacheKey]);

  /** Shows `id` here and on the Leagues tab from now on. */
  const select = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        await AsyncStorage.setItem(selectedLeagueKey(userId), id);
      } catch {}
      await reload();
    },
    [userId, reload]
  );

  const live = state.status === "ready" && state.weeks.some((w) => w.state === "live");
  useLiveRefresh(reload, live, LIVE_REFRESH_MS);

  return { ...state, reload, select };
}
