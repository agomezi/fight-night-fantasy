import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import {
  filterPinnable,
  loadPinnableCalls,
  MAX_PINNED_CALLS,
  pinCall,
  type PinFilter,
  type PinnableCall,
} from "../services/pins";
import EmptyState from "./EmptyState";
import PressableScale from "./PressableScale";

const FILTERS: { id: PinFilter; label: string }[] = [
  { id: "best", label: "Best" },
  { id: "recent", label: "Recent" },
  { id: "underdogs", label: "Underdogs" },
];

/** The "Pin a call" sheet on your profile: every call you could pin, best
 * first, one tap to pin. Closes once it's pinned. */
export default function PinPicker({
  visible,
  pinnedCount,
  onClose,
  onPinned,
}: {
  visible: boolean;
  pinnedCount: number;
  onClose: () => void;
  onPinned: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [calls, setCalls] = useState<PinnableCall[] | null>(null);
  const [filter, setFilter] = useState<PinFilter>("best");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    setCalls(null);
    loadPinnableCalls()
      .then((v) => current && setCalls(v))
      .catch(() => current && setCalls([]));
    return () => {
      current = false;
    };
  }, [visible]);

  if (!visible) return null;
  const left = MAX_PINNED_CALLS - pinnedCount;
  const shown = calls ? filterPinnable(calls, filter) : [];

  const pin = (boutId: string) => {
    if (saving) return;
    setSaving(boutId);
    pinCall(boutId)
      .then(() => {
        onPinned();
        onClose();
      })
      .catch((e) => Alert.alert("Couldn't pin it", e instanceof Error ? e.message : "Please try again."))
      .finally(() => setSaving(null));
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        entering={SlideInDown.duration(220)}
        style={{
          maxHeight: "80%",
          backgroundColor: c.card,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: insets.bottom + 12,
        }}
      >
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 10 }} />
        <Text style={{ fontFamily: "BebasNeue", fontSize: 30, color: c.text, letterSpacing: 0.5 }}>Pin a call</Text>
        <Text style={{ color: c.textMuted, fontSize: 13, marginTop: -2 }}>
          Your best calls first. {left} spot{left === 1 ? "" : "s"} left.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 6 }}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <PressableScale
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 16,
                  backgroundColor: on ? c.red : "transparent",
                  borderWidth: on ? 0 : 1,
                  borderColor: c.borderStrong,
                }}
              >
                <Text style={{ color: on ? "#FFFFFF" : c.text2, fontSize: 12, fontWeight: "800" }}>{f.label}</Text>
              </PressableScale>
            );
          })}
        </View>

        {!calls ? (
          <ActivityIndicator color={c.textMuted} style={{ marginVertical: 30 }} />
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon="pin-outline"
            title={filter === "underdogs" ? "No underdog calls yet" : "Nothing to pin yet"}
            message="Calls you get right show up here once their fight is final."
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {shown.map((call, i) => (
              <View
                key={call.boutId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 13,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
                    {call.call}
                    {call.underdog ? <Text style={{ color: c.gold, fontSize: 10, letterSpacing: 1 }}>  DOG</Text> : null}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {call.fight} · {call.date} · {call.points}
                  </Text>
                </View>
                {call.pinned ? (
                  <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>PINNED</Text>
                ) : (
                  <PressableScale
                    onPress={() => pin(call.boutId)}
                    disabled={left <= 0 || !!saving}
                    style={{
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: 18,
                      backgroundColor: c.red,
                      justifyContent: "center",
                      opacity: left <= 0 ? 0.4 : 1,
                    }}
                  >
                    {saving === call.boutId ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>PIN</Text>
                    )}
                  </PressableScale>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}
