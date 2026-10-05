// Achievements, earned from your pick history. Pure, so every rule is tested
// without a database.

import type { History, HistoryBout } from "./history";

export type Achievement = {
  id: string;
  icon: "flash" | "locate" | "flame" | "star" | "calendar";
  title: string;
  /** What it takes, while locked; what you did, once earned. */
  sub: string;
  earned: boolean;
  /** 0–1 towards earning it. */
  progress: number;
};

const STREAK_GOAL = 10;
const REGULAR_GOAL = 3;
/** A card counts as perfect only with enough picks to mean something. */
const PERFECT_MIN_PICKS = 5;

/** A scored pick that called the method as well as the fighter: 100 or more
 * on full points (a decision or "any finish" call is 100, a named round 125). */
function bullseye(b: HistoryBout): boolean {
  return b.verdict === "hit" && Number(b.points ?? 0) >= 100;
}

/** Scored picks, oldest first. Events arrive newest first with the main event
 * (fought last) at the top of each card. */
function chronological(history: History): HistoryBout[] {
  return [...history.events]
    .reverse()
    .flatMap((e) => [...e.bouts].reverse())
    .filter((b) => b.verdict === "hit" || b.verdict === "miss");
}

function longestStreak(bouts: HistoryBout[]): number {
  let best = 0;
  let run = 0;
  for (const b of bouts) {
    run = b.verdict === "hit" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function achievementsFor(history: History | null): Achievement[] {
  const events = history?.events ?? [];
  const scored = history ? chronological(history) : [];
  const hits = scored.filter((b) => b.verdict === "hit").length;
  const bullseyes = scored.filter(bullseye).length;
  const streak = longestStreak(scored);
  const played = events.filter((e) => e.picked > 0 && !e.live).length;
  const perfect = events.some((e) => !e.live && !e.provisional && e.total >= PERFECT_MIN_PICKS && e.hit === e.total);

  return [
    {
      id: "first-blood",
      icon: "flash",
      title: "First Blood",
      sub: hits > 0 ? "Called your first winner" : "Call a winner",
      earned: hits > 0,
      progress: hits > 0 ? 1 : 0,
    },
    {
      id: "bullseye",
      icon: "locate",
      title: "Bullseye",
      sub: bullseyes > 0 ? `Fighter and method right ${bullseyes}×` : "Get the fighter and the method right",
      earned: bullseyes > 0,
      progress: bullseyes > 0 ? 1 : 0,
    },
    {
      id: "regular",
      icon: "calendar",
      title: "Fight Night Regular",
      sub: played >= REGULAR_GOAL ? `Played ${played} cards` : `Play ${REGULAR_GOAL} cards · ${played}/${REGULAR_GOAL}`,
      earned: played >= REGULAR_GOAL,
      progress: Math.min(played / REGULAR_GOAL, 1),
    },
    {
      id: "streak",
      icon: "flame",
      title: "Undefeated Streak",
      sub:
        streak >= STREAK_GOAL
          ? `${streak} correct picks in a row`
          : `${STREAK_GOAL} correct picks in a row · best ${streak}`,
      earned: streak >= STREAK_GOAL,
      progress: Math.min(streak / STREAK_GOAL, 1),
    },
    {
      id: "perfect",
      icon: "star",
      title: "Perfect Card",
      sub: perfect ? "Every pick right on a card" : `Every pick right on a card of ${PERFECT_MIN_PICKS}+`,
      earned: perfect,
      progress: perfect ? 1 : 0,
    },
  ];
}

/** The latest scored picks, newest first, for the profile. */
export function recentPicks(history: History | null, count = 3): HistoryBout[] {
  return (history?.events ?? []).flatMap((e) => e.bouts.filter((b) => b.settled)).slice(0, count);
}
