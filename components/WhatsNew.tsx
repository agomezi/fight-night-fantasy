import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { whatsNewSeenKey } from "../constants/storage";
import { whatsNewToShow, type WhatsNewEntry } from "../constants/whatsNew";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

/** What changed in this update, in a card over the screen, once per account
 * on this phone. Mounted only once the player is signed in and past the boot
 * animation. */
export default function WhatsNew({ userId, accountCreatedAt }: { userId: string; accountCreatedAt?: string | null }) {
  const { c } = useTheme();
  const [entry, setEntry] = useState<WhatsNewEntry | null>(null);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(whatsNewSeenKey(userId))
      .then((seen) => {
        if (current) setEntry(whatsNewToShow(seen, accountCreatedAt));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [userId, accountCreatedAt]);

  if (!entry) return null;

  const close = () => {
    AsyncStorage.setItem(whatsNewSeenKey(userId), entry.id).catch(() => {});
    setEntry(null);
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
          <Text style={{ fontFamily: "BebasNeue", fontSize: 34, color: c.text, letterSpacing: 0.5, marginTop: 2 }}>
            {entry.title}
          </Text>
          <View style={{ width: 36, height: 3, backgroundColor: c.red, borderRadius: 2, marginTop: 2, marginBottom: 14 }} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
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
