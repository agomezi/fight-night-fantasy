import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";
import { makeProfileStyles } from "../styles/profile";

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
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeProfileStyles);

  const shareProfile = () => {
    Share.share({
      message: "ELITE_STRIKER · Level 84 · 14,280 pts on Fight Night 🥊",
    }).catch(() => {});
  };

  const MENU: {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }[] = [
    { id: "edit", icon: "create-outline", label: "Edit Profile", onPress: () => router.push("/edit-profile") },
    { id: "share", icon: "share-social-outline", label: "Share Profile", onPress: shareProfile },
    { id: "settings", icon: "settings-outline", label: "Settings", onPress: () => router.push("/settings") },
    {
      id: "signout",
      icon: "log-out-outline",
      label: "Sign Out",
      onPress: () => router.replace("/login"),
      danger: true,
    },
  ];

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ProfileBadge />
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <NotificationBell />
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
              <Ionicons name="trending-up" size={12} color={c.green} />
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
              <Ionicons name="person" size={22} color={c.textFaint} />
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
              <Ionicons name={a.icon} size={20} color={a.locked ? c.textFaint : c.red} />
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
            {a.locked && <Ionicons name="lock-closed" size={16} color={c.textFaint} />}
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
        </View>

        <View style={styles.menuCard}>
          {MENU.map((item, i) => (
            <Pressable
              key={item.id}
              onPress={item.onPress}
              style={[styles.menuRow, i > 0 && styles.menuRowBorder]}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={item.danger ? c.red : c.text2}
              />
              <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>
                {item.label}
              </Text>
              {!item.danger && (
                <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="profile" />
      </View>
    </SafeAreaView>
  );
}
