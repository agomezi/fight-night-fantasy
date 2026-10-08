import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ModerationCase from "../components/ModerationCase";
import PressableScale from "../components/PressableScale";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

/** One case, opened from the queue or a case alert. */
export default function ModerationCaseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const caseId = Number(id);
  // Opened from an alert there is nothing to go back to, so go to the queue.
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/moderation"));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <PressableScale style={styles.headerBtn} onPress={leave} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Back</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Case</Text>
        <View style={styles.headerBtnRight} />
      </View>
      {Number.isInteger(caseId) && caseId > 0 ? (
        <ModerationCase caseId={caseId} onDone={leave} />
      ) : (
        <Text style={{ color: c.textMuted, textAlign: "center", padding: 24 }}>No case to show.</Text>
      )}
    </SafeAreaView>
  );
}
