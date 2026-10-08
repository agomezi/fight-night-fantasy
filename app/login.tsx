import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Text,
  TextInput,
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
import { signInError } from "../services/standing";

type Provider = "apple" | "google" | "password";

export default function LoginScreen() {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLoginStyles);
  const { width } = useWindowDimensions();
  const title = useMemo(() => titleLine(titleSize(width - GUTTER * 2)), [width]);
  const { signInWithApple, signInWithGoogle, signInWithPassword } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  // Email sign-in is for accounts made in the dashboard, like App Review's demo
  // account. New users always come through Apple or Google.
  const [emailForm, setEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // On success the session changes and the layout's route guard takes over.
  const run = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    try {
      if (provider === "password") {
        Keyboard.dismiss();
        await signInWithPassword(email, password);
      } else {
        await (provider === "apple" ? signInWithApple() : signInWithGoogle());
      }
    } catch (e) {
      const { title, message } = signInError(e instanceof Error ? e.message : "Please try again.");
      Alert.alert(title, message);
    } finally {
      setBusy(null);
    }
  };

  const openLink = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const ink = styles.heading.color;
  const canSubmit = email.trim().length > 0 && password.length > 0 && busy === null;

  const emailFields = (
    <View style={styles.buttons}>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={styles.footnote.color}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={styles.footnote.color}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => canSubmit && run("password")}
      />
      <TouchableOpacity
        style={[styles.button, styles.appleButton, !canSubmit && styles.buttonDimmed]}
        onPress={() => run("password")}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        {busy === "password" ? (
          <ActivityIndicator color={styles.appleText.color} />
        ) : (
          <Text style={[styles.buttonText, styles.appleText]}>Sign in</Text>
        )}
      </TouchableOpacity>
    </View>
  );

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
      {/* The spacer shrinks so the email form clears the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
        <Text style={styles.subheading}>
          {emailForm ? "Sign in with email." : "Sign in or create your account."}
        </Text>

        {emailForm ? (
          emailFields
        ) : (
          <View style={styles.buttons}>
            {appleAvailable && button("apple")}
            {button("google")}
          </View>
        )}

        {emailForm ? (
          <>
            <Text style={styles.footnote}>
              Email sign-in is for existing accounts. New here? Use Apple or Google.
            </Text>
            <Text
              style={styles.emailLink}
              onPress={() => setEmailForm(false)}
              accessibilityRole="button"
            >
              Back to Apple and Google
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.footnote}>New here? Your account is created automatically.</Text>
            <Text
              style={styles.emailLink}
              onPress={() => setEmailForm(true)}
              accessibilityRole="button"
            >
              Sign in with email
            </Text>
          </>
        )}

        <View style={styles.legal}>
          <Text style={styles.legalText} onPress={() => openLink(TERMS_URL)}>
            Terms of Service
          </Text>
          <Text style={styles.legalText}>·</Text>
          <Text style={styles.legalText} onPress={() => openLink(PRIVACY_URL)}>
            Privacy Policy
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
