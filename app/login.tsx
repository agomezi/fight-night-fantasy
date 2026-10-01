import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoogleG } from "../components/svg/icons";
import { PRIVACY_URL, TERMS_URL } from "../constants/legal";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { GUTTER, makeLoginStyles, titleLine, titleSize } from "../styles/login";

type Provider = "apple" | "google";

export default function LoginScreen() {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLoginStyles);
  const { width } = useWindowDimensions();
  const title = useMemo(() => titleLine(titleSize(width - GUTTER * 2)), [width]);
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // On success the session changes and the layout's route guard takes over.
  const run = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    try {
      await (provider === "apple" ? signInWithApple() : signInWithGoogle());
    } catch (e) {
      Alert.alert("Sign in failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const openLink = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const ink = styles.heading.color;

  const button = (provider: Provider) => {
    const apple = provider === "apple";
    const label = apple ? "Continue with Apple" : "Continue with Google";
    const fg = (apple ? styles.appleText : styles.googleText).color;
    return (
      <TouchableOpacity
        style={[
          styles.button,
          apple ? styles.appleButton : styles.googleButton,
          busy !== null && busy !== provider && styles.buttonDimmed,
        ]}
        onPress={() => run(provider)}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy === provider ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.buttonRow}>
            {apple ? (
              <Ionicons name="logo-apple" size={24} color={fg} />
            ) : (
              <GoogleG size={22} />
            )}
            <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.eyebrow}>
        <View style={styles.eyebrowMark} />
        <Text style={styles.eyebrowText}>FANTASY MMA</Text>
      </View>

      <View style={styles.titleBlock} accessibilityRole="header" accessibilityLabel="Fight Night">
        <View style={title.line}>
          <Text style={[title.text, { color: ink }]}>FIGHT</Text>
        </View>
        <View style={title.gap} />
        <View style={title.line}>
          <View style={[title.band, { backgroundColor: c.red }]} />
          <Text style={[title.text, { color: ink }]}>NIGHT</Text>
        </View>
      </View>
      <Text style={styles.tagline}>YOUR PICKS. YOUR NIGHT.</Text>

      <View style={{ flex: 1 }} />

      <Text style={styles.heading}>Make your picks.</Text>
      <Text style={styles.subheading}>Sign in or create your account.</Text>

      <View style={styles.buttons}>
        {appleAvailable && button("apple")}
        {button("google")}
      </View>

      <Text style={styles.footnote}>New here? Your account is created automatically.</Text>

      <View style={styles.legal}>
        <Text style={styles.legalText} onPress={() => openLink(TERMS_URL)}>
          Terms of Service
        </Text>
        <Text style={styles.legalText}>·</Text>
        <Text style={styles.legalText} onPress={() => openLink(PRIVACY_URL)}>
          Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}
