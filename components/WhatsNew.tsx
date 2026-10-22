import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { whatsNewSeenKey } from "../constants/storage";
import { whatsNewToShow, type WhatsNewEntry } from "../constants/whatsNew";
import { holdModal } from "../services/modalGate";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

/** What changed since this account last looked, in a card over the screen,
 * once per account on this phone: every unseen entry, newest first. Mounted
 * only once the player is signed in and past the boot animation. */
export default function WhatsNew({ userId, accountCreatedAt }: { userId: string; accountCreatedAt?: string | null }) {
  const { c } = useTheme();
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);

  // Hold other cards (the awards reveal) back while deciding and while open.
  const [release, setRelease] = useState<(() => void) | null>(null);
  useEffect(() => {
    let current = true;
    const free = holdModal();
    AsyncStorage.getItem(whatsNewSeenKey(userId))
      .then((seen) => {
        if (!current) return;
        const unseen = whatsNewToShow(seen, accountCreatedAt);
        setEntries(unseen);
        if (unseen.length) setRelease(() => free);
        else free();
      })
      .catch(() => free());
    return () => {
      current = false;
      free();
    };
  }, [userId, accountCreatedAt]);

  if (!entries.length) return null;

  const close = () => {
    // The newest is enough: everything older counts as seen with it.
    AsyncStorage.setItem(whatsNewSeenKey(userId), entries[0].id).catch(() => {});
    setEntries([]);
    release?.();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Pressable
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.overlay }}
          onPress={close}
          accessibilityLabel="Close"
        />
        <Animated.View
          entering={appear()}
          style={{ backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 22, maxHeight: "85%" }}
        >
          <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>WHAT&apos;S NEW</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
            {entries.map((entry, n) => (
              <View key={entry.id} style={{ gap: 16, marginTop: n === 0 ? 0 : 10 }}>
                <View>
                  <Text style={{ fontFamily: "BebasNeue", fontSize: 32, color: c.text, letterSpacing: 0.5, marginTop: 2 }}>
                    {entry.title}
                  </Text>
                  <View style={{ width: 36, height: 3, backgroundColor: c.red, borderRadius: 2, marginTop: 2 }} />
                </View>
                {entry.items.map((item) => (
              <View key={item.title} style={{ flexDirection: "row", gap: 12 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c.inset,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={item.icon} size={16} color={c.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>{item.title}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>{item.body}</Text>
                </View>
              </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <PressableScale
            onPress={close}
            style={{ marginTop: 20, backgroundColor: c.red, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 1 }}>GOT IT</Text>
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}
