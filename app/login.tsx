import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "../constants/colors";
import { styles } from "../styles/login";

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
