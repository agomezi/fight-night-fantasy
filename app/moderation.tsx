import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ModerationQueue from "../components/ModerationQueue";
import PressableScale from "../components/PressableScale";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

/** For moderators: open cases and recent decisions. Reached from Settings;
 * the server refuses everyone else. */
export default function Moderation() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  // Reload whenever the screen comes back into view, so a case acted on
  // leaves the queue.
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((k) => k + 1), []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <PressableScale style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Back</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Moderation</Text>
        <View style={styles.headerBtnRight} />
      </View>
      <ModerationQueue refreshKey={refreshKey} onOpenCase={(id) => router.push(`/moderation-case?id=${id}`)} />
    </SafeAreaView>
  );
}
