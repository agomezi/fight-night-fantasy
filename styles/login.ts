import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

export const makeLoginStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.loginBg,
      padding: 24,
      justifyContent: "center",
    },
    title: {
      fontFamily: "BebasNeue",
      fontSize: 80,
      color: c.logoText,
      fontStyle: "italic",
      lineHeight: 80,
      marginBottom: 32,
      textAlign: "center",
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 24,
      borderWidth: 1,
      borderColor: c.loginBorder,
    },
    cardTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
      marginBottom: 4,
    },
    cardSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: "center",
      marginBottom: 8,
    },
    appleButton: { height: 52, width: "100%", marginTop: 16 },
    socialButton: {
      borderWidth: 1,
      borderColor: c.loginBorder,
      borderRadius: 8,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    socialRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    socialButtonText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 13,
      letterSpacing: 1,
    },
  });
