import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import EmptyState from "../components/EmptyState";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { loadInbox, markAllRead, timeAgo, type InboxItem } from "../services/inbox";
import type { NotificationKind } from "../services/notificationText";
import { makeCommonStyles } from "../styles/common";

/** Each kind gets its own glyph and accent, so the list is scannable by shape. */
const KIND: Record<NotificationKind, { icon: keyof typeof Ionicons.glyphMap; tint: (c: any) => string }> = {
  scored: { icon: "checkmark-circle", tint: (c) => c.green },
  final: { icon: "ribbon", tint: (c) => c.red },
  league_join: { icon: "people", tint: (c) => c.gold },
  reminder: { icon: "time", tint: (c) => c.blue },
  moderation: { icon: "shield-checkmark", tint: (c) => c.textMuted },
};

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: InboxItem[] };

/** Everything you've been sent, newest first. Leaving the screen marks it read. */
export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [state, setState] = useState<State>({ status: "loading" });
  const hasUnread = useRef(false);

  const markRead = useCallback(() => {
    if (!hasUnread.current) return;
    hasUnread.current = false;
    markAllRead().catch(() => {});
  }, []);

  // Keeps what is on screen if a refresh fails.
  const load = useCallback((isCurrent: () => boolean) => {
    loadInbox()
      .then((items) => {
        if (!isCurrent()) return;
        hasUnread.current = items.some((n) => !n.read);
        setState({ status: "ready", items });
      })
      .catch((e) => isCurrent() && setState((s) => (s.status === "ready" ? s : { status: "error", message: (e as Error).message })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      load(() => current);
      return () => {
        current = false;
        markRead();
      };
    }, [load, markRead])
  );

  const items = state.status === "ready" ? state.items : [];
  const unread = items.filter((n) => !n.read).length;
  const now = new Date();

  const readAll = () => {
    markRead();
    setState((s) => (s.status === "ready" ? { ...s, items: s.items.map((n) => ({ ...n, read: true })) } : s));
  };

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo}>Notifications</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        {state.status === "loading" && <ActivityIndicator color={c.red} style={{ marginTop: 40 }} />}
        {state.status === "error" && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your notifications"
            message={state.message}
            actionLabel="TRY AGAIN"
            onAction={() => {
              setState({ status: "loading" });
              load(() => true);
            }}
          />
        )}

        {state.status === "ready" && items.length === 0 && (
          <View style={{ paddingTop: 40 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>All quiet</Text>
            <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 }}>
              Results, league activity and lock reminders land here once you have a card in play.
            </Text>
          </View>
        )}

        {items.length > 0 && (
          <>
            <View style={[commonStyles.row, { marginBottom: 4 }]}>
              <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
                {unread > 0 ? `${unread} UNREAD` : "ALL READ"}
              </Text>
              {unread > 0 && (
                <PressableScale onPress={readAll} hitSlop={8}>
                  <Text style={{ color: c.red, fontSize: 12.5, fontWeight: "700" }}>Mark all read</Text>
                </PressableScale>
              )}
            </View>

            {items.map((n, i) => {
              const meta = KIND[n.kind];
              const tint = meta.tint(c);
              return (
                <Animated.View key={n.key} entering={appear(Math.min(i, 8))}>
                  <PressableScale
                    onPress={n.href ? () => router.push(n.href!) : undefined}
                    disabled={!n.href}
                    style={{
                      flexDirection: "row",
                      gap: 13,
                      paddingVertical: 15,
                      borderBottomWidth: i === items.length - 1 ? 0 : 1,
                      borderBottomColor: c.border,
                      opacity: n.read ? 0.62 : 1,
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
                      <Text style={{ color: c.text, fontSize: 14.5, fontWeight: n.read ? "700" : "800", letterSpacing: -0.1 }}>
                        {n.title}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 }}>{n.body}</Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={{ color: c.textFaint, fontSize: 11.5 }}>{timeAgo(n.sentAt, now)}</Text>
                      {!n.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.red }} />}
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
