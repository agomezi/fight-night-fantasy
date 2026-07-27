import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

export const makeSettingsStyles = (c: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    headerBtn: {
      minWidth: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    headerBtnRight: {
      minWidth: 64,
      justifyContent: "flex-end",
    },
    headerTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: "700",
    },
    headerAction: {
      color: c.red,
      fontSize: 15,
      fontWeight: "700",
      textAlign: "right",
    },
    headerBack: {
      color: c.text2,
      fontSize: 16,
      fontWeight: "600",
    },

    sectionLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.5,
      marginTop: 26,
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    rowBorder: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowIcon: {
      width: 30,
      alignItems: "center",
    },
    rowLabel: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      fontWeight: "600",
    },
    rowLabelDanger: {
      color: c.red,
    },
    rowValue: {
      color: c.textMuted,
      fontSize: 14,
    },
    rowSub: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    hint: {
      color: c.textFaint,
      fontSize: 12,
      marginTop: 10,
      marginLeft: 4,
      lineHeight: 17,
    },

    avatarWrap: {
      alignItems: "center",
      marginTop: 12,
      marginBottom: 8,
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
    changePhoto: {
      color: c.red,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 12,
    },

    fieldLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      marginTop: 18,
      marginBottom: 8,
      marginLeft: 4,
    },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: c.text,
      fontSize: 15,
    },
    inputDisabled: {
      color: c.textMuted,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: "top",
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: 24,
    },
    modalIcon: {
      alignSelf: "center",
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "rgba(232,0,61,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    modalTitle: {
      color: c.text,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    modalText: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 22,
    },
    deleteBtn: {
      backgroundColor: c.red,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: "center",
    },
    deleteBtnText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 1,
    },
    cancelBtn: {
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
    },
    cancelBtnText: {
      color: c.text2,
      fontSize: 15,
      fontWeight: "700",
    },
  });
