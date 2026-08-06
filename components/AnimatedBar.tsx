import { useEffect } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

/**
 * A progress bar that fills from empty on mount and eases whenever the value
 * changes. A bar that's just *there* at 61% reads as a static image; watching
 * it travel is most of what makes a stat feel measured rather than printed.
 */
export default function AnimatedBar({
  percent,
  height = 6,
  color,
  trackColor,
  delay = 120,
  style,
}: {
  /** 0-100. */
  percent: number;
  height?: number;
  color?: string;
  trackColor?: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const progress = useSharedValue(0);

  const target = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(target, { duration: 650 }));
  }, [delay, progress, target]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor ?? c.borderStrong,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            borderRadius: height / 2,
            backgroundColor: color ?? c.red,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}
