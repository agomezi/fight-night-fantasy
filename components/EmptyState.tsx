import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

export default function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { c } = useTheme();

  return (
    <View style={{ alignItems: "center", paddingVertical: compact ? 24 : 40 }}>
      <Animated.View
        entering={appear(0)}
        style={{
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
          borderRadius: compact ? 22 : 28,
          backgroundColor: c.inset,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={compact ? 20 : 26} color={c.textFaint} />
      </Animated.View>

      <Animated.Text
        entering={appear(1)}
        style={{
          color: c.text2,
          fontSize: compact ? 14 : 16,
          fontWeight: "700",
          marginTop: 14,
          textAlign: "center",
        }}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={appear(2)}
        style={{
          color: c.textFaint,
          fontSize: 13,
          lineHeight: 19,
          marginTop: 6,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        {message}
      </Animated.Text>

      {actionLabel && onAction && (
        <Animated.View entering={appear(3)}>
          <PressableScale
            onPress={onAction}
            style={{
              marginTop: 18,
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: c.borderStrong,
            }}
          >
            <Text
              style={{
                color: c.text2,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.5,
              }}
            >
              {actionLabel}
            </Text>
          </PressableScale>
        </Animated.View>
      )}
    </View>
  );
}
