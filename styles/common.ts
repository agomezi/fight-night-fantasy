import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

export const makeCommonStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      padding: 24,
    },
    homeCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 24,
      borderWidth: 1,
      borderColor: c.border,
    },
    label: {
      fontSize: 11,
      fontWeight: "700",
      color: c.textMuted,
      letterSpacing: 1,
      marginBottom: 8,
    },
    mainButton: {
      backgroundColor: c.red,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
      marginTop: 8,
    },
    mainButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 14,
      letterSpacing: 2,
    },
    line: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLogo: {
      fontFamily: "BebasNeue",
      fontSize: 26,
      color: c.logoText,
      letterSpacing: 5,
      textAlign: "center",
      transform: [{ skewX: "-8deg" }],
    },

    divider: {
      height: 1,
      backgroundColor: c.border,
      opacity: 0.8,
      marginTop: 14,
      marginBottom: 22,
      marginHorizontal: -24,
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

    cardWrapper: {
      position: "relative",
      marginTop: 24,
      flexDirection: "row",
      justifyContent: "space-around",
    },
    square: {
      flex: 1,
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },

    infoCardTitleRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "flex-start",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 4,
    },
    infoCardTitle: {
      flexShrink: 1,
      textAlign: "left",
      marginBottom: 0,
    },

    titleUnit: {
      fontSize: 18,
      fontWeight: "600",
      color: c.textMuted,
      alignSelf: "flex-end",
      marginBottom: 8,
    },
    deltaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    deltaText: {
      fontSize: 14,
      fontWeight: "600",
    },
    deltaPositive: {
      color: c.green,
    },
    deltaNegative: {
      color: c.red,
    },
  });
