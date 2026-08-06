import { useEffect } from "react";
import { useSharedValue, withTiming } from "react-native-reanimated";

/**
 * Drives a boolean (selected / active / on) as a 0->1 animated value.
 *
 * Call sites feed it into `interpolateColor` or a transform so state changes
 * ease instead of snapping. Keeping this in one hook means every selectable
 * thing in the app changes state at the same speed.
 */
export function useToggleProgress(active: boolean, duration = 180) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration });
  }, [active, duration, progress]);

  return progress;
}
