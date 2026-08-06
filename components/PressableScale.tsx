import * as Haptics from "expo-haptics";
import { Platform, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Snappy enough to feel instant, soft enough not to look mechanical.
const SPRING = { damping: 16, stiffness: 340, mass: 0.5 };

export type HapticStrength = "light" | "medium" | "heavy" | "none";

const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export default function PressableScale({
  children,
  style,
  onPress,
  haptic = "light",
  scaleTo = 0.96,
  dim = 0.75,
  disabled,
  ...rest
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  haptic?: HapticStrength;
  /** How far to shrink on press. Bigger surfaces want a subtler value. */
  scaleTo?: number;
  /** Opacity while held. 1 disables the fade. */
  dim?: number;
}) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1 - pressed.value * (1 - scaleTo), SPRING) }],
    opacity: withTiming(1 - pressed.value * (1 - dim), { duration: 90 }),
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animatedStyle]}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      onPress={(e) => {
        // Haptics are iOS/Android only; calling them on web rejects.
        if (haptic !== "none" && Platform.OS !== "web") {
          Haptics.impactAsync(IMPACT[haptic]).catch(() => {});
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
