import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

export const makeLeaguesStyles = (c: Palette) =>
  StyleSheet.create({
    // --- league hero -------------------------------------------------------
    eyebrow: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2,
    },
    leagueName: {
      fontFamily: "BebasNeue",
      fontSize: 46,
      lineHeight: 48,
      color: c.text,
      letterSpacing: 1,
      marginTop: 6,
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
    },
    memberText: {
      color: c.textMuted,
      fontSize: 13,
    },
    actionRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface2,
    },
    actionButtonText: {
      color: c.text,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.5,
    },

    // --- generic card ------------------------------------------------------
    card: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
      marginTop: 18,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardTitle: {
      color: c.text,
      fontSize: 19,
      fontWeight: "700",
    },
    cardMeta: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
    },

    // --- standings table ---------------------------------------------------
    columnHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    columnLabel: {
      color: c.textFaint,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    standingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 10,
      marginHorizontal: -10,
      borderRadius: 12,
    },
    standingRowMe: {
      backgroundColor: c.redTint,
      borderWidth: 1,
      borderColor: "rgba(232,0,61,0.35)",
    },
    rankCell: {
      width: 42,
      alignItems: "center",
    },
    rank: {
      color: c.text,
      fontSize: 17,
      fontWeight: "800",
    },
    rankMuted: {
      color: c.textMuted,
    },
    moveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      marginTop: 2,
    },
    moveText: {
      fontSize: 10,
      fontWeight: "700",
    },
    moveUp: { color: c.green },
    moveDown: { color: c.red },
    moveFlat: { color: c.textFaint },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.input,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarMe: {
      borderColor: c.red,
    },
    avatarText: {
      color: c.text2,
      fontSize: 13,
      fontWeight: "800",
    },
    playerCell: {
      flex: 1,
      marginLeft: 12,
    },
    playerName: {
      color: c.text,
      fontSize: 15,
      fontWeight: "700",
    },
    playerNameMe: {
      color: c.red,
    },
    playerTeam: {
      color: c.textFaint,
      fontSize: 12,
      marginTop: 1,
    },
    points: {
      color: c.text,
      fontSize: 17,
      fontWeight: "800",
    },
    pointsUnit: {
      color: c.textFaint,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
      textAlign: "right",
      marginTop: 1,
    },
    ghostButton: {
      marginTop: 16,
      paddingVertical: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: "center",
    },
    ghostButtonText: {
      color: c.text2,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
    },

    // --- rivalry -----------------------------------------------------------
    rivalryCard: {
      backgroundColor: c.heroTint,
      borderColor: "rgba(232,0,61,0.35)",
    },
    liveRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.red,
    },
    liveText: {
      color: c.red,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    rivalryTitle: {
      fontFamily: "BebasNeue",
      fontSize: 34,
      color: c.text,
      letterSpacing: 1,
      marginTop: 10,
    },
    rivalryTitleAccent: {
      color: c.red,
    },
    rivalrySub: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    projRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 18,
    },
    projLabel: {
      color: c.textFaint,
      fontSize: 11,
      fontWeight: "700",
    },
    projValue: {
      color: c.text,
      fontSize: 22,
      fontWeight: "800",
      marginTop: 2,
    },
    projTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.borderStrong,
      overflow: "hidden",
      marginTop: 10,
      flexDirection: "row",
    },
    projFill: {
      height: 6,
      backgroundColor: c.red,
    },
    primaryButton: {
      marginTop: 18,
      backgroundColor: c.red,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.5,
    },

    // --- rising stars ------------------------------------------------------
    riserRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.inset,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
    },
    riserDelta: {
      color: c.green,
      fontSize: 15,
      fontWeight: "800",
    },

    // --- chatter -----------------------------------------------------------
    chatRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    chatBubble: {
      flex: 1,
      backgroundColor: c.inset,
      borderRadius: 12,
      borderTopLeftRadius: 4,
      padding: 12,
      marginTop: 4,
    },
    chatAuthor: {
      color: c.text2,
      fontSize: 12,
      fontWeight: "700",
    },
    chatTime: {
      color: c.textFaint,
      fontSize: 11,
    },
    chatText: {
      color: c.text2,
      fontSize: 13,
      lineHeight: 19,
    },
    chatInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 16,
      backgroundColor: c.input,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
    },
    chatInput: {
      flex: 1,
      color: c.text,
      fontSize: 14,
      paddingVertical: 12,
    },

    // --- standings screen --------------------------------------------------
    screenHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    screenTitle: {
      fontFamily: "BebasNeue",
      fontSize: 42,
      color: c.text,
      letterSpacing: 4,
      textAlign: "center",
      marginTop: 10,
    },
    screenSub: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: "center",
      marginTop: 2,
    },
    screenNote: {
      color: c.textFaint,
      fontSize: 12,
      textAlign: "center",
      marginTop: 6,
    },
    toggleRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 20,
      marginBottom: 6,
    },
    toggle: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    toggleActive: {
      backgroundColor: c.red,
      borderColor: c.red,
    },
    toggleText: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.5,
      color: c.text2,
    },
    toggleTextActive: {
      color: "#FFFFFF",
    },
    crown: {
      position: "absolute",
      top: -6,
      left: -4,
    },

    // --- stat strip --------------------------------------------------------
    statCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginTop: 12,
    },
    statLabel: {
      color: c.textFaint,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    statValue: {
      color: c.text,
      fontSize: 28,
      fontWeight: "800",
      marginTop: 4,
    },
    statDelta: {
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 5,
    },
  });
