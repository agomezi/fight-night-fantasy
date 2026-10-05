import { createContext, useContext } from "react";

/**
 * Lets a swipeable surface veto taps on what it carries. React Native's
 * Pressable doesn't know about gesture-handler swipes, so a swipe that starts
 * and ends on a button would otherwise also press it.
 */
export type SwipeGuard = {
  /** True while a swipe is in progress. */
  swiping: boolean;
  /** When the last swipe ended, in ms. */
  endedAt: number;
  /** Where the current press started, to tell a tap from a drag. */
  pressStart: { x: number; y: number } | null;
};

/** A press shortly after a swipe is the swipe's own touch ending. */
const SETTLE_MS = 350;
/** Further than this between press in and press out is a drag, not a tap. */
const TAP_SLOP = 12;

export const SwipeGuardContext = createContext<SwipeGuard | null>(null);

export function useSwipeGuard(): SwipeGuard | null {
  return useContext(SwipeGuardContext);
}

/** Whether a press inside a swipeable surface should be ignored. */
export function suppressPress(guard: SwipeGuard | null, end: { x: number; y: number }, now = Date.now()): boolean {
  if (!guard) return false;
  if (guard.swiping || now - guard.endedAt < SETTLE_MS) return true;
  const start = guard.pressStart;
  return start != null && (Math.abs(end.x - start.x) > TAP_SLOP || Math.abs(end.y - start.y) > TAP_SLOP);
}
