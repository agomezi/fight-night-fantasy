import { FadeInDown, FadeInUp } from "react-native-reanimated";

// One place for entrance timing so every screen settles at the same rhythm.
// Staggering by index is what makes a list read as "dealt out" rather than
// snapped into place all at once.
const BASE_DELAY = 40;
const STEP = 70;

/** Cards and rows sliding up into place. `i` is the item's index in its group. */
export const appear = (i = 0) =>
  FadeInDown.delay(BASE_DELAY + i * STEP)
    .springify()
    .damping(18)
    .stiffness(160);

/** For headers and hero text, which read better coming down from above. */
export const appearFromTop = (i = 0) =>
  FadeInUp.delay(BASE_DELAY + i * STEP)
    .springify()
    .damping(18)
    .stiffness(160);

/** Slow breathing pulse — used on live/active indicators. */
export const PULSE = {
  animationName: {
    "0%": { opacity: 0.35, transform: [{ scale: 0.85 }] },
    "50%": { opacity: 1, transform: [{ scale: 1.15 }] },
    "100%": { opacity: 0.35, transform: [{ scale: 0.85 }] },
  },
  animationDuration: "1600ms",
  animationIterationCount: "infinite",
} as const;

/** Left-to-right sheen for skeleton/empty placeholders. */
export const SHIMMER = {
  animationName: {
    "0%": { opacity: 0.4 },
    "50%": { opacity: 0.8 },
    "100%": { opacity: 0.4 },
  },
  animationDuration: "1400ms",
  animationIterationCount: "infinite",
} as const;
