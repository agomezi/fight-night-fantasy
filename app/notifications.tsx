import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { NOTIFICATIONS, Notification } from "../constants/league";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";

/** Each kind gets its own glyph and accent, so the list is scannable by shape. */
const KIND: Record<
  Notification["kind"],
  { icon: keyof typeof Ionicons.glyphMap; tint: (c: any) => string }
> = {
  result: { icon: "checkmark-circle", tint: (c) => c.green },
  league: { icon: "people", tint: (c) => c.gold },
  matchup: { icon: "flash", tint: (c) => c.red },
  reminder: { icon: "time", tint: (c) => c.blue },
};

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);

  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
      >
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo}>Notifications</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        {NOTIFICATIONS.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
              All quiet
            </Text>
            <Text
              style={{ color: c.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 }}
            >
              Results, league activity and lock reminders land here once you
              have a card in play.
            </Text>
          </View>
        ) : (
          <>
            <View style={[commonStyles.row, { marginBottom: 4 }]}>
              <Text
                style={{
                  color: c.textMuted,
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 1.4,
                }}
              >
                {unread > 0 ? `${unread} UNREAD` : "ALL READ"}
              </Text>
              {unread > 0 && (
                <Text style={{ color: c.red, fontSize: 12.5, fontWeight: "700" }}>
                  Mark all read
                </Text>
              )}
            </View>

            {NOTIFICATIONS.map((n, i) => {
              const meta = KIND[n.kind];
              const tint = meta.tint(c);
              return (
                <Animated.View key={n.id} entering={appear(i)}>
                  <PressableScale
                    onPress={() => router.back()}
                    style={{
                      flexDirection: "row",
                      gap: 13,
                      paddingVertical: 15,
                      borderBottomWidth: i === NOTIFICATIONS.length - 1 ? 0 : 1,
                      borderBottomColor: c.border,
                      opacity: n.unread ? 1 : 0.62,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: c.inset,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={meta.icon} size={17} color={tint} />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: 14.5,
                          fontWeight: n.unread ? "800" : "700",
                          letterSpacing: -0.1,
                        }}
                      >
                        {n.title}
                      </Text>
                      <Text
                        style={{
                          color: c.textMuted,
                          fontSize: 13,
                          lineHeight: 19,
                          marginTop: 2,
                        }}
                      >
                        {n.body}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{n.time}</Text>
                      {n.unread && (
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: c.red,
                          }}
                        />
                      )}
                    </View>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
