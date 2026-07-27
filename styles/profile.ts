import { StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";

export const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#160B0E",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2a1418",
    padding: 22,
    alignItems: "center",
    overflow: "hidden",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: "#171717",
    borderWidth: 2,
    borderColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 32,
  },
  username: {
    fontFamily: "BebasNeue",
    fontSize: 40,
    color: "#fff",
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
    color: COLORS.red,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  memberLine: {
    color: "#5aa9e6",
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
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#222224",
    padding: 16,
    overflow: "hidden",
  },
  statAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.red,
  },
  statLabel: {
    color: COLORS.gray,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  statValue: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
  },
  statValueRed: {
    color: COLORS.red,
  },
  statSub: {
    color: COLORS.gray,
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
    color: "#00C853",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  accuracyTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2a2a2a",
    marginTop: 10,
    overflow: "hidden",
  },
  accuracyFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.red,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  viewHistory: {
    color: COLORS.gray,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#222224",
    padding: 12,
    marginBottom: 10,
  },
  pickThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pickInfo: {
    flex: 1,
  },
  pickName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  pickMeta: {
    color: COLORS.gray,
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
    color: "#2ecc71",
  },
  lossText: {
    color: COLORS.red,
  },
  pickPoints: {
    fontSize: 13,
    fontWeight: "800",
  },
  pointsPositive: {
    color: "#2ecc71",
  },
  pointsNegative: {
    color: COLORS.red,
  },

  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#222224",
    padding: 14,
    marginBottom: 10,
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
    backgroundColor: "#1d1d1d",
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  achievementTitleLocked: {
    color: "#666",
  },
  achievementSub: {
    color: COLORS.gray,
    fontSize: 12,
    marginTop: 2,
  },

  unlockBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
  },
  unlockBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
});
