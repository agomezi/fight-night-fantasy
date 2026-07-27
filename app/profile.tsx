import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import { COLORS } from "../constants/colors";
import { commonStyles } from "../styles/common";
import { styles } from "../styles/profile";

type Pick = {
  id: string;
  name: string;
  meta: string;
  result: "WIN" | "LOSS";
  points: number;
};

type Achievement = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  locked?: boolean;
};

const RECENT_PICKS: Pick[] = [
  { id: "1", name: "Islam Makhachev", meta: "Submission · Round 3", result: "WIN", points: 180 },
  { id: "2", name: "Dustin Poirier", meta: "KO/TKO · Round 2", result: "LOSS", points: -45 },
  { id: "3", name: "Sean O'Malley", meta: "Decision · Unanimous", result: "WIN", points: 110 },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: "1", icon: "mic", title: "Undefeated Streak", sub: "10 Correct Picks in a row" },
  { id: "2", icon: "star", title: "Perfect Event", sub: "Locked 12/12 · Coming soon", locked: true },
];

export default function Profile() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: "#0A0A0A", padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="60" fill="#1a0a0a" />
            <Circle cx="60" cy="60" r="59" fill="none" stroke="#E8003D" strokeWidth="2" />
            <Circle cx="60" cy="47" r="20" fill="#E8003D" fillOpacity="0.85" />
            <Path d="M20 108C20 84.8 37.9 68 60 68C82.1 68 100 84.8 100 108" fill="#E8003D" fillOpacity="0.85" />
          </Svg>
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Path d="M60 20C51.16 20 44 27.16 44 36V40.5C34.6 44.8 28 54.2 28 65V82L20 92V96H100V92L92 82V65C92 54.2 85.4 44.8 76 40.5V36C76 27.16 68.84 20 60 20Z" fill="#E8003D" />
            <Path d="M48 100C48 106.6 53.4 112 60 112C66.6 112 72 106.6 72 100H48Z" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="none" stroke="#0A0A0A" strokeWidth="2" />
          </Svg>
        </View>
        <View style={commonStyles.divider} />

        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>ES</Text>
          </View>
          <Text style={styles.username}>ELITE_STRIKER</Text>
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>LEVEL 84</Text>
          </View>
          <Text style={styles.memberLine}>Member since UFC 280 · Tactical Specialist</Text>
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <View style={styles.statAccent} />
            <Text style={styles.statLabel}>TOTAL POINTS</Text>
            <Text style={styles.statValue}>14,280</Text>
            <View style={styles.statDelta}>
              <Ionicons name="trending-up" size={12} color="#00C853" />
              <Text style={styles.statDeltaText}>+420 THIS WEEK</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>GLOBAL RANK</Text>
            <Text style={styles.statValue}>#1,204</Text>
            <Text style={styles.statSub}>TOP 2% OVERALL</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>LEAGUE RANK</Text>
            <Text style={[styles.statValue, styles.statValueRed]}>#4</Text>
            <Text style={styles.statSub}>HEAVYWEIGHT DIV</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PICK ACCURACY</Text>
            <Text style={styles.statValue}>78.4%</Text>
            <View style={styles.accuracyTrack}>
              <View style={[styles.accuracyFill, { width: "78.4%" }]} />
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT PICKS</Text>
          <Text style={styles.viewHistory}>VIEW HISTORY</Text>
        </View>

        {RECENT_PICKS.map((pick) => (
          <View key={pick.id} style={styles.pickRow}>
            <View style={styles.pickThumb}>
              <Ionicons name="person" size={22} color="#555" />
            </View>
            <View style={styles.pickInfo}>
              <Text style={styles.pickName}>{pick.name}</Text>
              <Text style={styles.pickMeta}>{pick.meta}</Text>
            </View>
            <View style={styles.pickResult}>
              <View
                style={[
                  styles.resultPill,
                  pick.result === "WIN" ? styles.winPill : styles.lossPill,
                ]}
              >
                <Text
                  style={[
                    styles.resultPillText,
                    pick.result === "WIN" ? styles.winText : styles.lossText,
                  ]}
                >
                  {pick.result}
                </Text>
              </View>
              <Text
                style={[
                  styles.pickPoints,
                  pick.points >= 0 ? styles.pointsPositive : styles.pointsNegative,
                ]}
              >
                {pick.points >= 0 ? `+${pick.points}` : pick.points} pts
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
        </View>

        {ACHIEVEMENTS.map((a) => (
          <View key={a.id} style={styles.achievementRow}>
            <View
              style={[
                styles.achievementIcon,
                a.locked ? styles.achievementIconLocked : styles.achievementIconActive,
              ]}
            >
              <Ionicons name={a.icon} size={20} color={a.locked ? "#666" : COLORS.red} />
            </View>
            <View style={styles.achievementInfo}>
              <Text
                style={[
                  styles.achievementTitle,
                  a.locked && styles.achievementTitleLocked,
                ]}
              >
                {a.title}
              </Text>
              <Text style={styles.achievementSub}>{a.sub}</Text>
            </View>
            {a.locked && <Ionicons name="lock-closed" size={16} color="#555" />}
          </View>
        ))}

        <View style={styles.unlockBtn}>
          <Text style={styles.unlockBtnText}>UNLOCK MORE</Text>
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="profile" />
      </View>
    </SafeAreaView>
  );
}
