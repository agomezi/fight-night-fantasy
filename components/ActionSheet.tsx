import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

export type SheetAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Shown on the right, small: "2 of 3 used". */
  note?: string;
  destructive?: boolean;
  disabled?: boolean;
};

/** A menu that slides up from the bottom: a short heading, then one row per
 * action. Tapping an action closes it first. */
export default function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        entering={SlideInDown.duration(220)}
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: insets.bottom + 18,
        }}
      >
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 12 }} />
        {!!title && (
          <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 4 }} numberOfLines={1}>
            {title}
          </Text>
        )}
        {actions.map((a, i) => (
          <PressableScale
            key={a.label}
            disabled={a.disabled}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 4,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.border,
              opacity: a.disabled ? 0.45 : 1,
            }}
          >
            <Ionicons name={a.icon} size={19} color={a.destructive ? c.red : a.icon.startsWith("pin") ? c.red : c.text2} />
            <Text style={{ flex: 1, color: a.destructive ? c.red : c.text, fontSize: 16, fontWeight: "600" }}>{a.label}</Text>
            {!!a.note && <Text style={{ color: c.textMuted, fontSize: 12 }}>{a.note}</Text>}
          </PressableScale>
        ))}
      </Animated.View>
    </Modal>
  );
}
