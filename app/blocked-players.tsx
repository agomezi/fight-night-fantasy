import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BlockedPlayersList from "../components/BlockedPlayersList";
import PressableScale from "../components/PressableScale";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

/** Settings → Blocked players: review and unblock. */
export default function BlockedPlayers() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <PressableScale style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Back</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Blocked players</Text>
        <View style={styles.headerBtnRight} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <BlockedPlayersList />
      </ScrollView>
    </SafeAreaView>
  );
}
