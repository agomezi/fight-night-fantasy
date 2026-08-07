import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { useToggleProgress } from "../hooks/useToggleProgress";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import StandingRow from "../components/StandingRow";
import {
    EVENT_STANDINGS,
    LEAGUE,
    LEAGUE_STATS,
    SEASON_STANDINGS,
} from "../constants/league";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

type Scope = "season" | "event";

/** Season / Last Event switch — the fill slides in rather than snapping. */
function ScopeToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const progress = useToggleProgress(active);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["transparent", c.red],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.borderStrong, c.red],
    ),
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [c.text2, "#FFFFFF"]),
  }));

  return (
    <PressableScale onPress={onPress} style={[styles.toggle, boxStyle]}>
      <Animated.Text style={[styles.toggleText, textStyle]}>
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

export default function LeagueStandings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);
  const [scope, setScope] = useState<Scope>("season");

  const rows = scope === "season" ? SEASON_STANDINGS : EVENT_STANDINGS;

  const inviteFriends = () => {
    Share.share({
      message: LEAGUE
        ? `Join "${LEAGUE.name}" on Fight Night and take your shot at the #1 spot 🥊`
        : "Join me on Fight Night and take your shot at the #1 spot 🥊",
    }).catch(() => {});
  };

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
      >
        <View style={styles.screenHeader}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <PressableScale onPress={inviteFriends} hitSlop={12}>
            <Ionicons name="person-add-outline" size={22} color={c.red} />
          </PressableScale>
        </View>

        <Text style={styles.screenTitle}>
          {LEAGUE ? LEAGUE.name.toUpperCase() : "STANDINGS"}
        </Text>
        <Text style={styles.screenSub}>
          {LEAGUE
            ? `${LEAGUE.members} Members · ${scope === "season" ? "Season" : `Week ${LEAGUE.week}`}`
            : "No league joined"}
        </Text>
        <Text style={styles.screenNote}>Standings reflect picks since you joined</Text>

        <View style={styles.toggleRow}>
          {(["season", "event"] as Scope[]).map((key) => (
            <ScopeToggle
              key={key}
              label={key === "season" ? "SEASON" : "LAST EVENT"}
              active={scope === key}
              onPress={() => setScope(key)}
            />
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Full Standings</Text>
            <Text style={styles.cardMeta}>{rows.length} PLAYERS</Text>
          </View>

          {rows.length === 0 ? (
            <EmptyState
              icon="podium-outline"
              title="No standings yet"
              message={
                scope === "season"
                  ? "Join a league and make your first picks — season standings build from there."
                  : "Nothing has been scored yet. Event standings appear after fight night."
              }
            />
          ) : (
            <>
              <View style={styles.columnHeader}>
                <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
                <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>PLAYER</Text>
                <Text style={styles.columnLabel}>PTS</Text>
              </View>

              {rows.map((s, i) => (
                <StandingRow key={s.id} standing={s} padRank index={i} />
              ))}
            </>
          )}
        </View>

        {LEAGUE_STATS.map((stat, i) => (
          <Animated.View key={stat.id} entering={appear(i)} style={styles.statCard}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text
                style={[
                  styles.statDelta,
                  {
                    color:
                      stat.positive === null
                        ? c.textFaint
                        : stat.positive
                          ? c.green
                          : c.red,
                  },
                ]}
              >
                {stat.delta}
              </Text>
            </View>
          </Animated.View>
        ))}

        <PressableScale style={styles.primaryButton} onPress={inviteFriends}>
          <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>INVITE FRIENDS</Text>
        </PressableScale>
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
