import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { whatsNewSeenKey } from "../constants/storage";
import { newerSeen, seenToSave, whatsNewToShow, type WhatsNewEntry } from "../constants/whatsNew";
import { holdModal } from "../services/modalGate";
import { supabase } from "../services/supabase";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

/** What changed since this account last looked, in a card over the screen,
 * once per account: the newest unseen entries, with a link to Patch Notes when
 * there were more. Seen is kept on the account, so a reinstall or a new phone
 * doesn't show it again. Mounted only once the player is signed in and past
 * the boot animation. */
export default function WhatsNew({
  userId,
  accountCreatedAt,
  accountSeenId,
}: {
  userId: string;
  accountCreatedAt?: string | null;
  /** The last entry closed, from the account's metadata. */
  accountSeenId?: string | null;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [missed, setMissed] = useState(0);
  // Read when deciding and closing, but saving it shouldn't rerun the check.
  const accountSeen = useRef(accountSeenId);
  accountSeen.current = accountSeenId;

  // Hold other cards (the awards reveal) back while deciding and while open.
  const [release, setRelease] = useState<(() => void) | null>(null);
  useEffect(() => {
    let current = true;
    const free = holdModal();
    // This phone's record is from before seen moved to the account: copy it
    // over when it's newer, so a reinstall doesn't show it again.
    AsyncStorage.getItem(whatsNewSeenKey(userId))
      .then((local) => {
        if (!current) return;
        const account = accountSeen.current;
        const backfill = seenToSave(account, local);
        if (backfill) supabase.auth.updateUser({ data: { whats_new_seen: backfill } }).catch(() => {});
        const { show, missed } = whatsNewToShow(newerSeen(account, local), accountCreatedAt);
        setEntries(show);
        setMissed(missed);
        if (show.length) setRelease(() => free);
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
    // The newest is enough: everything older counts as seen with it. The
    // phone keeps a copy in case the account save doesn't go through.
    const id = entries[0].id;
    AsyncStorage.setItem(whatsNewSeenKey(userId), id).catch(() => {});
    const save = seenToSave(accountSeen.current, id);
    if (save) supabase.auth.updateUser({ data: { whats_new_seen: save } }).catch(() => {});
    setEntries([]);
    release?.();
  };

  const seeAll = () => {
    close();
    router.push("/patch-notes");
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
          {missed > 0 && (
            <PressableScale onPress={seeAll} hitSlop={8} style={{ marginTop: 16, alignItems: "center" }}>
              <Text style={{ color: c.textMuted, fontSize: 13 }}>
                {missed === 1 ? "1 more update" : `${missed} more updates`} since you last looked.{" "}
                <Text style={{ color: c.red, fontWeight: "700" }}>See Patch Notes</Text>
              </Text>
            </PressableScale>
          )}
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
