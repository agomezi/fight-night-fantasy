import { StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a0a0a",
    padding: 24,
  },
  homeCard: {
    backgroundColor: "#141414",
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: "#222224",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 8,
  },
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
  line: {
    height: 1,
    backgroundColor: "#3a1a1a",
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.white,
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
    color: "#f5d0c5",
    letterSpacing: 5,
    textAlign: "center",
    transform: [{ skewX: "-8deg" }],
  },

  divider: {
    height: 1,
    backgroundColor: "#242424",
    opacity: 0.8,
    marginTop: 14,
    marginBottom: 22,
    marginHorizontal: -24,
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
});
