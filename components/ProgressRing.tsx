import { useEffect, useRef } from "react";
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
 * where you sit in the league. It opens already at its value: the home cards
 * remount as you swipe between them, and a sweep from empty on every return
 * read as progress lost. It moves only when the value does, from where it was
 * to where it is. `animateOnMount` brings back the opening sweep.
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
  animateOnMount = false,
}: {
  value: number;
  total: number;
  /** Defaults to `value`. Pass a string for things like "4th". */
  center?: string;
  caption?: string;
  size?: number;
  thickness?: number;
  color?: string;
  /** Delay before the opening sweep, when there is one. */
  delay?: number;
  /** Sweep from empty when the ring first appears. */
  animateOnMount?: boolean;
}) {
  const { c } = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;

  const sweep = useSharedValue(animateOnMount ? 0 : pct);
  // The value last drawn, so only a real change animates. Kept in a ref, so a
  // re-run of the effect with the same value (a re-render, or React's dev-mode
  // double mount) leaves the ring alone.
  const drawn = useRef<number | null>(null);

  useEffect(() => {
    const first = drawn.current == null;
    if (drawn.current === pct) return;
    drawn.current = pct;
    if (first) {
      if (animateOnMount) sweep.value = withDelay(delay, withTiming(pct, { duration: 750 }));
      return;
    }
    // From wherever it is now, so a change mid-sweep carries on smoothly.
    sweep.value = withTiming(pct, { duration: 600 });
  }, [animateOnMount, delay, pct, sweep]);

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
