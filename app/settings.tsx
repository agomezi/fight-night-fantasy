import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, Switch, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { PRIVACY_URL, TERMS_URL } from "../constants/legal";
import { appear } from "../constants/motion";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { isModerator } from "../services/moderation";
import { disablePush, enablePush, loadNotifyPrefs, pushPermission, saveNotifyPref, type NotifyPrefs } from "../services/push";
import { makeSettingsStyles } from "../styles/settings";


export default function Settings() {
  const router = useRouter();
  const { c, mode, preference, setPreference } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);

  const [analytics, setAnalytics] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { deleteAccount, session } = useAuth();
  const userId = session?.user.id;

  // Push: the phone's permission, and which kinds this player wants.
  const [pushOn, setPushOn] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  useEffect(() => {
    pushPermission().then((p) => setPushOn(p === "granted")).catch(() => {});
    if (userId) loadNotifyPrefs(userId).then(setPrefs).catch(() => {});
  }, [userId]);

  // Only moderators see the way in; the server checks every call anyway.
  const [moderator, setModerator] = useState(false);
  useEffect(() => {
    if (userId) isModerator().then(setModerator).catch(() => {});
  }, [userId]);

  const togglePush = async (on: boolean) => {
    if (!on) {
      // The phone's permission can only be revoked in iOS Settings; turning
      // it off here stops this phone being sent anything.
      setPushOn(false);
      await disablePush();
      return;
    }
    const result = await enablePush(true);
    setPushOn(result === "granted");
    if (result === "denied") {
      Alert.alert("Notifications are off", "Turn them on for Fight Night Fantasy in your phone's Settings.", [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const togglePref = (key: keyof NotifyPrefs) => (value: boolean) => {
    if (!userId || !prefs) return;
    setPrefs({ ...prefs, [key]: value });
    saveNotifyPref(userId, key, value).catch(() => setPrefs((p) => (p ? { ...p, [key]: !value } : p)));
  };
  const PREF_ROWS: { key: keyof NotifyPrefs; label: string; sub: string }[] = [
    { key: "notify_reminders", label: "Lock reminders", sub: "An hour before a card starts locking" },
    { key: "notify_results", label: "Fight results", sub: "Each fight you picked, as it's scored" },
    { key: "notify_summary", label: "Card recap", sub: "Your total once every result is official" },
    { key: "notify_league_activity", label: "League activity", sub: "When someone joins a league you own" },
  ];

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

  // On success the session is cleared and the route guard returns to login.
  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (e) {
      setDeleting(false);
      setShowDelete(false);
      Alert.alert(
        "Couldn't delete your account",
        e instanceof Error ? e.message : "Please try again."
      );
    }
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
              <Ionicons name="phone-portrait-outline" size={20} color={c.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Match System</Text>
              <Text style={styles.rowSub}>Follow your phone&apos;s light or dark setting</Text>
            </View>
            <Switch
              value={preference === "system"}
              onValueChange={(on) => setPreference(on ? "system" : mode)}
              {...switchColors}
            />
          </View>
          {preference !== "system" && (
            <View style={[styles.row, styles.rowBorder]}>
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
                onValueChange={(on) => setPreference(on ? "light" : "dark")}
                {...switchColors}
              />
            </View>
          )}
        </Animated.View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS & CONSENT</Text>
        <Animated.View entering={appear(1)} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={20} color={c.text2} />
            </View>
            <Text style={[styles.rowLabel, { flex: 1 }]}>Push Notifications</Text>
            <Switch value={pushOn} onValueChange={togglePush} {...switchColors} />
          </View>
          {pushOn &&
            prefs &&
            PREF_ROWS.map((row) => (
              <View key={row.key} style={[styles.row, styles.rowBorder]}>
                <View style={styles.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowSub}>{row.sub}</Text>
                </View>
                <Switch value={prefs[row.key]} onValueChange={togglePref(row.key)} {...switchColors} />
              </View>
            ))}
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
          <PressableScale style={[styles.row, styles.rowBorder]} onPress={() => router.push("/blocked-players")}>
            <View style={styles.rowIcon}>
              <Ionicons name="ban-outline" size={20} color={c.text2} />
            </View>
            <Text style={styles.rowLabel}>Blocked Players</Text>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </PressableScale>
        </Animated.View>

        {moderator && (
          <>
            <Text style={styles.sectionLabel}>MODERATION</Text>
            <View style={styles.card}>
              <PressableScale style={styles.row} onPress={() => router.push("/moderation")}>
                <View style={styles.rowIcon}>
                  <Ionicons name="shield-half-outline" size={20} color={c.text2} />
                </View>
                <Text style={styles.rowLabel}>Reports and cases</Text>
                <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
              </PressableScale>
            </View>
          </>
        )}

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
          Deleting your account erases your name and sign-in details right away and removes you
          from global rankings. Your leagues show you as a former member until the season ends,
          then your picks and history are removed. This cannot be undone.
        </Text>
      </ScrollView>

      <Modal
        visible={showDelete}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !deleting && setShowDelete(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={appear()}
            style={styles.modalCard}
          >
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={28} color={c.red} />
            </View>
            <Text style={styles.modalTitle}>Delete Account?</Text>
            <Text style={styles.modalText}>
              Your account and personal details are deleted right away. You can&apos;t undo this
              action.
            </Text>
            <PressableScale style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteBtnText}>DELETE PERMANENTLY</Text>
              )}
            </PressableScale>
            <PressableScale
              style={styles.cancelBtn}
              onPress={() => setShowDelete(false)}
              disabled={deleting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </PressableScale>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
