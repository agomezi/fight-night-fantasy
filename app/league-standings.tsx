import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
      message: `Join "${LEAGUE.name}" on Fight Night and take your shot at the #1 spot 🥊`,
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
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </Pressable>
          <Pressable onPress={inviteFriends} hitSlop={12}>
            <Ionicons name="person-add-outline" size={22} color={c.red} />
          </Pressable>
        </View>

        <Text style={styles.screenTitle}>{LEAGUE.name.toUpperCase()}</Text>
        <Text style={styles.screenSub}>
          {LEAGUE.members} Members · {scope === "season" ? "Season" : `Week ${LEAGUE.week}`}
        </Text>
        <Text style={styles.screenNote}>Standings reflect picks since you joined</Text>

        <View style={styles.toggleRow}>
          {(["season", "event"] as Scope[]).map((key) => {
            const active = scope === key;
            return (
              <Pressable
                key={key}
                onPress={() => setScope(key)}
                style={[styles.toggle, active && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {key === "season" ? "SEASON" : "LAST EVENT"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Full Standings</Text>
            <Text style={styles.cardMeta}>{rows.length} PLAYERS</Text>
          </View>

          <View style={styles.columnHeader}>
            <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
            <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>PLAYER</Text>
            <Text style={styles.columnLabel}>PTS</Text>
          </View>

          {rows.map((s) => (
            <StandingRow key={s.id} standing={s} padRank />
          ))}
        </View>

        {LEAGUE_STATS.map((stat) => (
          <View key={stat.id} style={styles.statCard}>
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
          </View>
        ))}

        <Pressable style={styles.primaryButton} onPress={inviteFriends}>
          <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>INVITE FRIENDS</Text>
        </Pressable>
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
