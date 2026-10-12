// Timing for the boot animation (assets/images/boot-combo.gif): eight frames
// of 130 ms, a jab, a cross, then a kick. The fighter is back in his guard as
// frames 2, 4 and 0 begin, the only moments it can fade out without cutting a
// strike off halfway. Frame 0 is also the still (boot-guard.png) shown first.

/** How long the fighter stands in his guard before he starts working the
 * bag. Most starts are done by then and never see a punch. */
export const STILL_MS = 800;

/** One full combo. */
export const COMBO_MS = 1040;

/** When the fighter is back in his guard, counted from the start of a combo:
 * after the jab, after the cross, and after the kick as it starts over. */
const GUARD_MS = [260, 520, COMBO_MS];

/**
 * The first moment at or after `elapsed` ms into the combo when the fighter
 * is back in his guard, so a slow start ends after the strike in progress.
 */
export function nextGuard(elapsed: number): number {
  const combo = Math.floor(Math.max(0, elapsed) / COMBO_MS) * COMBO_MS;
  return combo + GUARD_MS.find((g) => combo + g >= elapsed)!;
}
