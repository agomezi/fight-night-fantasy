import Animated from "react-native-reanimated";
import { PULSE } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeLeaguesStyles } from "../styles/leagues";

/**
 * The red "live" indicator. The pulse is what sells it as a real-time
 * readout rather than a static red circle.
 */
export default function LiveDot() {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);

  return (
    <Animated.View style={[styles.liveDot, { backgroundColor: c.red }, PULSE]} />
  );
}
