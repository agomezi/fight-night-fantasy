import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeLoginStyles } from "../styles/login";

type Provider = "apple" | "google";

export default function LoginScreen() {
  const { c, mode } = useTheme();
  const styles = useThemedStyles(makeLoginStyles);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FIGHT NIGHT</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>
        <Text style={styles.cardSubtitle}>
          New here? Signing in creates your account.
        </Text>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              mode === "light"
                ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            }
            cornerRadius={8}
            style={styles.appleButton}
            onPress={() => run("apple")}
          />
        )}

        <TouchableOpacity
          style={styles.socialButton}
          onPress={() => run("google")}
          disabled={busy !== null}
        >
          {busy === "google" ? (
            <ActivityIndicator color={c.text} />
          ) : (
            <View style={styles.socialRow}>
              <Ionicons name="logo-google" size={18} color={c.text} />
              <Text style={styles.socialButtonText}>CONTINUE WITH GOOGLE</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
