import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { RuleRow, RulesSheet } from "../services/leagueOnboarding";
import PressableScale from "./PressableScale";

const ICON: Record<RuleRow["icon"], keyof typeof Ionicons.glyphMap> = {
  people: "people-outline",
  doubleheader: "copy-outline",
  minimum: "list-outline",
};

/** A league's rules in a sheet from the bottom: before joining, with the join
 * button, or from the league page, with just a close. */
export default function LeagueRulesSheet({
  sheet,
  actionLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  sheet: RulesSheet | null;
  actionLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!sheet} transparent animationType="slide" statusBarTranslucent onRequestClose={busy ? () => {} : onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Tapping above the sheet closes it. */}
        <Pressable
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.overlay }}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="Close"
        />
        {sheet && (
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: c.borderStrong,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 20 + insets.bottom,
            }}
          >
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginBottom: 18 }} />
            <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>{sheet.eyebrow}</Text>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
              {sheet.title}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>{sheet.intro}</Text>

            {sheet.rows.map((row) => (
              <View key={row.icon} style={{ flexDirection: "row", gap: 14, marginTop: 18 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: c.redTint,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={ICON[row.icon]} size={20} color={c.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>{row.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{row.body}</Text>
                </View>
              </View>
            ))}

            {error ? (
              <Text style={{ color: c.red, fontSize: 13.5, fontWeight: "700", marginTop: 18, textAlign: "center" }}>{error}</Text>
            ) : null}

            <PressableScale
              onPress={onConfirm}
              disabled={busy}
              style={{
                marginTop: 24,
                height: 54,
                borderRadius: 14,
                backgroundColor: c.red,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: 1.4 }}>{actionLabel}</Text>
              )}
            </PressableScale>
          </View>
        )}
      </View>
    </Modal>
  );
}
