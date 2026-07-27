import { useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeLoginStyles } from "../styles/login";

export default function LoginScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeLoginStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FIGHT NIGHT</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>
        <Text style={styles.cardSubtitle}>
          Enter your details to access the arena.
        </Text>
        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="fighter@example.com"
          placeholderTextColor={c.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.passwordRow}>
          <Text style={styles.label}>PASSWORD</Text>
          <Text style={styles.forgot}>Forgot?</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={c.textMuted}
          keyboardType="ascii-capable"
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => router.replace("/home")}
        >
          <Text style={styles.mainButtonText}>ENTER ARENA</Text>
        </TouchableOpacity>
        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.line} />
        </View>
        <TouchableOpacity style={styles.socialButton}>
          <Text style={styles.socialButtonText}>CONTINUE WITH APPLE</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.socialButton, { marginTop: 12 }]}>
          <Text style={styles.socialButtonText}>CONTINUE WITH GOOGLE</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.signupText}>
        Don&apos;t have an account? <Text style={styles.signupLink}>Sign Up</Text>
      </Text>
    </View>
  );
}
