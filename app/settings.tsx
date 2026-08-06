import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Modal, ScrollView, Switch, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeSettingsStyles } from "../styles/settings";

const PRIVACY_URL = "https://example.com/privacy";
const TERMS_URL = "https://example.com/terms";

export default function Settings() {
  const router = useRouter();
  const { c, mode, toggle } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [showDelete, setShowDelete] = useState(false);

  const switchColors = {
    trackColor: { false: c.borderStrong, true: c.red },
    thumbColor: "#FFFFFF",
    ios_backgroundColor: c.borderStrong,
  };

  const downloadData = () => {
    Alert.alert(
      "Download My Data",
      "We'll prepare an export of your account data and email a download link to you within 48 hours.",
      [{ text: "OK" }]
    );
  };

  const openLink = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const confirmDelete = () => {
    setShowDelete(false);
    router.replace("/login");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <PressableScale style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={styles.headerBack}>Back</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerBtnRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <Animated.View entering={appear(0)} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="contrast-outline" size={20} color={c.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Light Mode</Text>
              <Text style={styles.rowSub}>
                {mode === "light" ? "Light theme is on" : "Using dark theme"}
              </Text>
            </View>
            <Switch
              value={mode === "light"}
              onValueChange={toggle}
              {...switchColors}
            />
          </View>
        </Animated.View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS & CONSENT</Text>
        <Animated.View entering={appear(1)} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={20} color={c.text2} />
            </View>
            <Text style={styles.rowLabel}>Push Notifications</Text>
            <Switch value={pushEnabled} onValueChange={setPushEnabled} {...switchColors} />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowIcon}>
              <Ionicons name="bar-chart-outline" size={20} color={c.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Analytics</Text>
              <Text style={styles.rowSub}>Anonymous usage & crash data to improve the app</Text>
            </View>
            <Switch value={analytics} onValueChange={setAnalytics} {...switchColors} />
          </View>
        </Animated.View>
        <Text style={styles.hint}>
          You can change your consent choices at any time. Turning off analytics limits how we
          measure app performance.
        </Text>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <Animated.View entering={appear(2)} style={styles.card}>
          <PressableScale style={styles.row} onPress={downloadData}>
            <View style={styles.rowIcon}>
              <Ionicons name="download-outline" size={20} color={c.text2} />
            </View>
            <Text style={styles.rowLabel}>Download My Data</Text>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </PressableScale>
        </Animated.View>

        <Text style={styles.sectionLabel}>LEGAL</Text>
        <Animated.View entering={appear(3)} style={styles.card}>
          <PressableScale style={styles.row} onPress={() => openLink(PRIVACY_URL)}>
            <View style={styles.rowIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={c.text2} />
            </View>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={18} color={c.textFaint} />
          </PressableScale>
          <PressableScale style={[styles.row, styles.rowBorder]} onPress={() => openLink(TERMS_URL)}>
            <View style={styles.rowIcon}>
              <Ionicons name="document-text-outline" size={20} color={c.text2} />
            </View>
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Ionicons name="open-outline" size={18} color={c.textFaint} />
          </PressableScale>
        </Animated.View>

        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <Animated.View entering={appear(4)} style={styles.card}>
          <PressableScale style={styles.row} onPress={() => setShowDelete(true)}>
            <View style={styles.rowIcon}>
              <Ionicons name="trash-outline" size={20} color={c.red} />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={18} color={c.red} />
          </PressableScale>
        </Animated.View>
        <Text style={styles.hint}>
          Deleting your account permanently removes your picks, stats, and league history. This
          cannot be undone.
        </Text>
      </ScrollView>

      <Modal
        visible={showDelete}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDelete(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={28} color={c.red} />
            </View>
            <Text style={styles.modalTitle}>Delete Account?</Text>
            <Text style={styles.modalText}>
              This permanently deletes your account and all associated data. You can&apos;t undo
              this action.
            </Text>
            <PressableScale style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteBtnText}>DELETE PERMANENTLY</Text>
            </PressableScale>
            <PressableScale style={styles.cancelBtn} onPress={() => setShowDelete(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
