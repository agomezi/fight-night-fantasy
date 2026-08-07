import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

export const makeProfileStyles = (c: Palette) =>
  StyleSheet.create({
    heroCard: {
      backgroundColor: c.heroTint,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 22,
      alignItems: "center",
      overflow: "hidden",
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 16,
      backgroundColor: c.input,
      borderWidth: 2,
      borderColor: c.red,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: c.text,
      fontWeight: "700",
      fontSize: 32,
    },
    username: {
      fontFamily: "BebasNeue",
      fontSize: 40,
      color: c.text,
      letterSpacing: 2,
      marginTop: 16,
      textAlign: "center",
    },
    levelPill: {
      marginTop: 10,
      backgroundColor: "rgba(232,0,61,0.15)",
      borderWidth: 1,
      borderColor: "rgba(232,0,61,0.5)",
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 5,
    },
    levelPillText: {
      color: c.red,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    memberLine: {
      color: c.blue,
      fontSize: 13,
      marginTop: 12,
      textAlign: "center",
    },

    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginTop: 16,
    },
    statCard: {
      flexGrow: 1,
      flexBasis: "45%",
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      overflow: "hidden",
    },
    statAccent: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: c.red,
    },
    statLabel: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    statValue: {
      color: c.text,
      fontSize: 30,
      fontWeight: "800",
    },
    statValueRed: {
      color: c.red,
    },
    statSub: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginTop: 6,
    },
    statDelta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 6,
    },
    statDeltaText: {
      color: c.green,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    accuracyTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.borderStrong,
      marginTop: 10,
      overflow: "hidden",
    },
    accuracyFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.red,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 28,
      marginBottom: 12,
    },
    sectionTitle: {
      color: c.red,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    viewHistory: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
    },

    pickRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginBottom: 10,
    },
    pickThumb: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.input,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    pickInfo: {
      flex: 1,
    },
    pickName: {
      color: c.text,
      fontSize: 15,
      fontWeight: "700",
    },
    pickMeta: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    pickResult: {
      alignItems: "flex-end",
    },
    resultPill: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 4,
    },
    winPill: {
      backgroundColor: "rgba(0,200,83,0.15)",
    },
    lossPill: {
      backgroundColor: "rgba(232,0,61,0.15)",
    },
    resultPillText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
    },
    winText: {
      color: c.green,
    },
    lossText: {
      color: c.red,
    },
    pickPoints: {
      fontSize: 13,
      fontWeight: "800",
    },
    pointsPositive: {
      color: c.green,
    },
    pointsNegative: {
      color: c.red,
    },

    // Achievements are read, not tapped, so they lose the box and become
    // ruled rows like the rest of the scorecard content.
    achievementRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    achievementIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    achievementIconActive: {
      backgroundColor: "rgba(232,0,61,0.15)",
    },
    achievementIconLocked: {
      backgroundColor: c.input,
    },
    achievementInfo: {
      flex: 1,
    },
    achievementTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: "700",
    },
    achievementTitleLocked: {
      color: c.textFaint,
    },
    achievementSub: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },

    menuCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    menuRowBorder: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    menuLabel: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      fontWeight: "600",
    },
    menuLabelDanger: {
      color: c.red,
    },
  });
