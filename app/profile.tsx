import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import AnimatedBar from "../components/AnimatedBar";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import ResultRow from "../components/ResultRow";
import HeaderBar from "../components/HeaderBar";
import { useAuth } from "../context/AuthContext";
import { getInitials, useProfile } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";
import { makeProfileStyles } from "../styles/profile";
import { useHistory } from "../hooks/useHistory";
import { useLeague } from "../hooks/useLeague";
import { achievementsFor, recentPicks } from "../services/achievements";
import { loadLeaderboard, type LeaderboardRow } from "../services/leaderboard";
import { rankLabel } from "../services/leagues";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeProfileStyles);
  const { profile } = useProfile();
  const { signOut } = useAuth();

  // Your season so far, your place on the global table and in your league.
  const historyState = useHistory();
  const history = historyState.status === "ready" ? historyState.history : null;
  const league = useLeague();
  const leagueMe = league.status === "ready" ? (league.standings?.me ?? null) : null;
  const [globalMe, setGlobalMe] = useState<LeaderboardRow | null>(null);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      historyState.reload();
      loadLeaderboard(1).then((b) => current && setGlobalMe(b.me)).catch(() => {});
      return () => {
        current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const season = history?.season ?? null;
  const points = season?.points ?? 0;
  const accuracy = season && season.total > 0 ? Math.round((season.hit / season.total) * 100) : null;
  const recent = recentPicks(history);
  const achievements = achievementsFor(history);

  // The route guard returns to the login screen once the session is gone.
  const handleSignOut = () => {
    signOut().catch((e) =>
      Alert.alert("Couldn't sign out", e instanceof Error ? e.message : "Please try again.")
    );
  };

  const shareProfile = () => {
    Share.share({
      message: `${profile.username} just joined Fight Night Fantasy 🥊`,
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
      onPress: handleSignOut,
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
        <HeaderBar />

        <Animated.View entering={appear(0)} style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile.username)}</Text>
          </View>
          <Text style={styles.username}>{profile.username}</Text>
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>LEVEL 1</Text>
          </View>
          <Text style={styles.memberLine}>New member · {profile.title}</Text>
        </Animated.View>

        <View style={styles.statGrid}>
          <Animated.View entering={appear(1)} style={styles.statCard}>
            <View style={styles.statAccent} />
            <Text style={styles.statLabel}>TOTAL POINTS</Text>
            <Text style={styles.statValue}>{points.toLocaleString()}</Text>
            <View style={styles.statDelta}>
              <Ionicons name={season && season.events > 0 ? "calendar-outline" : "remove"} size={12} color={c.textFaint} />
              <Text style={[styles.statDeltaText, { color: c.textFaint }]}>
                {season && season.events > 0
                  ? `${season.label} · ${season.events} CARD${season.events === 1 ? "" : "S"}`
                  : "NO POINTS YET"}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={appear(2)} style={styles.statCard}>
            <Text style={styles.statLabel}>GLOBAL RANK</Text>
            <Text style={styles.statValue}>{globalMe ? rankLabel(globalMe.rank, globalMe.tied) : "—"}</Text>
            <Text style={styles.statSub}>{globalMe ? season?.label ?? "THIS SEASON" : "UNRANKED"}</Text>
          </Animated.View>

          <Animated.View entering={appear(3)} style={styles.statCard}>
            <Text style={styles.statLabel}>LEAGUE RANK</Text>
            <Text style={styles.statValue}>{leagueMe?.rank != null ? rankLabel(leagueMe.rank, leagueMe.tied) : "—"}</Text>
            <Text style={styles.statSub} numberOfLines={1}>
              {league.status === "ready" && league.league
                ? leagueMe?.rank != null
                  ? `${leagueMe.record} · ${league.league.name.toUpperCase()}`
                  : "UNRANKED"
                : "NO LEAGUE"}
            </Text>
          </Animated.View>

          <Animated.View entering={appear(4)} style={styles.statCard}>
            <Text style={styles.statLabel}>PICK ACCURACY</Text>
            <Text style={styles.statValue}>{accuracy == null ? "—" : `${accuracy}%`}</Text>
            <AnimatedBar percent={accuracy ?? 0} height={4} style={{ marginTop: 10 }} />
          </Animated.View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT PICKS</Text>
          <PressableScale onPress={() => router.push("/history")} hitSlop={10}>
            <Text style={styles.viewHistory}>VIEW HISTORY</Text>
          </PressableScale>
        </View>

        {/* History uses the method-as-headline row: the finish is the
            headline, the fighter sits under it, and your call is stamped
            beside it. Same shape the lane predicts. */}
        {recent.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="No picks yet"
            message="Make your first picks for the next event and your results will show up here."
            actionLabel="MAKE YOUR PICKS"
            onAction={() => router.push("/picks")}
          />
        ) : (
          recent.map((b, i) => (
            <ResultRow
              key={b.id}
              index={i}
              red={b.red}
              blue={b.blue}
              meta={b.meta}
              detail={b.detail}
              points={b.points}
              verdict={b.verdict}
              verdictNote={b.voidNote ? `${b.pick} · ${b.voidNote}` : b.pick}
              settled={b.settled}
              last={i === recent.length - 1}
            />
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
        </View>

        {achievements.map((a, i) => (
          <Animated.View key={a.id} entering={appear(i)} style={styles.achievementRow}>
            <View
              style={[
                styles.achievementIcon,
                !a.earned ? styles.achievementIconLocked : styles.achievementIconActive,
              ]}
            >
              <Ionicons name={a.icon} size={20} color={!a.earned ? c.textFaint : c.red} />
            </View>
            <View style={styles.achievementInfo}>
              <Text
                style={[
                  styles.achievementTitle,
                  !a.earned && styles.achievementTitleLocked,
                ]}
              >
                {a.title}
              </Text>
              <Text style={styles.achievementSub}>{a.sub}</Text>
              {!a.earned && a.progress > 0 && (
                <AnimatedBar percent={a.progress * 100} height={3} style={{ marginTop: 6 }} />
              )}
            </View>
            {a.earned ? (
              <Ionicons name="checkmark-circle" size={18} color={c.green} />
            ) : (
              <Ionicons name="lock-closed" size={16} color={c.textFaint} />
            )}
          </Animated.View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
        </View>

        <View style={styles.menuCard}>
          {MENU.map((item, i) => (
            <PressableScale
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
            </PressableScale>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="profile" />
      </View>
    </SafeAreaView>
  );
}
