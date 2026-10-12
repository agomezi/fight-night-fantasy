// Timing for the boot animation (assets/images/boot-combo.gif): eight frames
// of 130 ms, a jab, a cross, then a kick. The fighter is back in his guard as
// frames 2, 4 and 0 begin, the only moments it can fade out without cutting a
// strike off halfway.

/** One full combo. */
export const COMBO_MS = 1040;

/** When the fighter is back in his guard, counted from the start of a combo:
 * after the jab, after the cross, and after the kick as it starts over. */
const GUARD_MS = [260, 520, COMBO_MS];

/**
 * The first moment at or after `elapsed` ms into the animation when the
 * fighter is back in his guard. A quick start ends on the jab; a slow one
 * keeps throwing until the next guard after it's ready.
 */
export function nextGuard(elapsed: number): number {
  const combo = Math.floor(Math.max(0, elapsed) / COMBO_MS) * COMBO_MS;
  return combo + GUARD_MS.find((g) => combo + g >= elapsed)!;
}
