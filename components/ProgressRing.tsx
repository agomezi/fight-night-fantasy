import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Donut with a figure in the middle.
 *
 * This is the "where am I" glance — how much of the card you've picked, or
 * where you sit in the league. It sweeps from empty on mount so returning to
 * the app re-states your progress rather than just showing a static number.
 */
export default function ProgressRing({
  value,
  total,
  center,
  caption,
  size = 148,
  thickness = 13,
  color,
  delay = 140,
}: {
  value: number;
  total: number;
  /** Defaults to `value`. Pass a string for things like "4th". */
  center?: string;
  caption?: string;
  size?: number;
  thickness?: number;
  color?: string;
  delay?: number;
}) {
  const { c } = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;

  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withDelay(delay, withTiming(pct, { duration: 750 }));
  }, [delay, pct, sweep]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - sweep.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c.borderStrong}
          strokeWidth={thickness}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? c.red}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start the sweep at 12 o'clock rather than 3.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <Text
        style={{
          color: c.text,
          fontSize: size * 0.26,
          fontWeight: "800",
          letterSpacing: -1,
          fontVariant: ["tabular-nums"],
          lineHeight: size * 0.3,
        }}
      >
        {center ?? String(value)}
      </Text>
      {caption && (
        <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 }}>
          {caption}
        </Text>
      )}
    </View>
  );
}
