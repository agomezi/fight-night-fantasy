import { FadeIn, FadeInDown, Keyframe } from "react-native-reanimated";

/*
 * Motion rules for this app:
 *
 * 1. Entrances are fast and short. You see them every single time you open a
 *    screen, so anything long or bouncy becomes irritating by the tenth visit.
 * 2. Stagger is capped. A 40-row list should not take three seconds to deal
 *    itself out — after a handful of items everything arrives together.
 * 3. Nothing loops forever unless it represents something genuinely live.
 *    A permanent pulse on a static screen is visual noise.
 */

const BASE_DELAY = 0;
const STEP = 35;
// Past this many items the delay stops growing, so long lists stay snappy.
const MAX_STAGGERED = 6;

const stagger = (i: number) => BASE_DELAY + Math.min(i, MAX_STAGGERED) * STEP;

/**
 * Cards and rows easing up into place. Deliberately short (220ms) and only a
 * few pixels of travel — enough to read as motion, not enough to wait on.
 */
export const appear = (i = 0) =>
  FadeInDown.duration(220).delay(stagger(i)).withInitialValues({
    transform: [{ translateY: 8 }],
  });

/** Plain cross-fade, for things where sliding would be too much. */
export const fadeIn = (i = 0) => FadeIn.duration(200).delay(stagger(i));

/**
 * Confirmation pop for badges and checkmarks: overshoots once, then settles.
 * A spring would oscillate several times, which reads as bouncy — this is a
 * fixed keyframe so it's exactly one bounce, every time.
 */
export const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.2 }] },
  60: { opacity: 1, transform: [{ scale: 1.12 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(240);

/**
 * Slow, low-contrast breathing for the live indicator. Only used where
 * something is actually live — never as decoration.
 */
export const PULSE = {
  animationName: {
    "0%": { opacity: 0.55 },
    "50%": { opacity: 1 },
    "100%": { opacity: 0.55 },
  },
  animationDuration: "2200ms",
  animationIterationCount: "infinite",
  animationTimingFunction: "ease-in-out",
} as const;
