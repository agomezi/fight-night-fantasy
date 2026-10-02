import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { SKELETON_PULSE } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";

/**
 * A placeholder block in the shape of the content it stands in for, so the
 * layout does not jump when the real card arrives.
 */
export default function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: c.border }, SKELETON_PULSE, style]}
    />
  );
}
