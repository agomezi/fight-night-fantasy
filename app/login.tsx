import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../constants/colors";

export default function LoginScreen() {
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
          placeholderTextColor={COLORS.gray}
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
          placeholderTextColor={COLORS.gray}
          keyboardType="ascii-capable"
          secureTextEntry
        />
        <TouchableOpacity style={styles.mainButton}>
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
        Don't have an account? <Text style={styles.signupLink}>Sign Up</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a0a0a",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontFamily: "BebasNeue",
    fontSize: 80,
    //fontWeight: "900",
    color: "#f5d0c5",
    fontStyle: "italic",
    lineHeight: 80,
    marginBottom: 32,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#2a0f0f",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#3a1a1a",
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a0a0a",
    borderWidth: 1,
    borderColor: "#3a1a1a",
    borderRadius: 8,
    padding: 16,
    color: COLORS.white,
    marginBottom: 16,
  },
  passwordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  forgot: { fontSize: 12, color: COLORS.red, fontWeight: "700" },
  mainButton: {
    backgroundColor: COLORS.red,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  mainButtonText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 2,
  },
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: "#3a1a1a" },
  orText: { color: COLORS.gray, marginHorizontal: 12, fontSize: 12 },
  socialButton: {
    borderWidth: 1,
    borderColor: "#3a1a1a",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  socialButtonText: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 1,
  },
  signupText: {
    color: COLORS.gray,
    textAlign: "center",
    marginTop: 24,
    fontSize: 14,
  },
  signupLink: { color: COLORS.white, fontWeight: "700" },
});
