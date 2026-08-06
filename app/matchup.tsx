import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import LiveDot from "../components/LiveDot";
import PressableScale from "../components/PressableScale";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import { MATCHUP_PICKS, MatchupPick, RIVALRY } from "../constants/league";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

function StatusPill({ status }: { status: MatchupPick["status"] }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const color =
    status === "LIVE" ? c.red : status === "FINAL" ? c.textFaint : c.blue;
  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusPillText, { color }]}>{status}</Text>
    </View>
  );
}

export default function Matchup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);

  // No opponent assigned yet — a new account sees the prompt, not a scoreboard.
  if (!RIVALRY) {
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
            <View style={{ width: 26 }} />
          </View>

          <Text style={styles.screenTitle}>HEAD TO HEAD</Text>

          <View style={styles.card}>
            <EmptyState
              icon="flash-outline"
              title="No matchup yet"
              message="Join a league and lock in your picks — your first head-to-head opponent is assigned when the next event opens."
              actionLabel="MAKE YOUR PICKS"
              onAction={() => router.push("/picks")}
            />
          </View>
        </ScrollView>

        <View style={{ height: insets.bottom }} />
      </SafeAreaView>
    );
  }

  const yourLive = MATCHUP_PICKS.reduce((sum, p) => sum + p.yourPoints, 0);
  const rivalLive = MATCHUP_PICKS.reduce((sum, p) => sum + p.rivalPoints, 0);
  const youLead = yourLive >= rivalLive;
  const total = RIVALRY.you.proj + RIVALRY.rival.proj;

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
          <View style={styles.liveRow}>
            <LiveDot />
            <Text style={styles.liveText}>{RIVALRY.event} · LIVE</Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        <Text style={styles.screenTitle}>HEAD TO HEAD</Text>

        {/* Scoreboard */}
        <View style={styles.versusCard}>
          <View style={styles.versusSide}>
            <View style={[styles.versusAvatar, styles.versusAvatarMe]}>
              <Text style={styles.avatarText}>{getInitials(RIVALRY.you.name)}</Text>
            </View>
            <Text style={styles.versusName}>{RIVALRY.you.name}</Text>
            <Text style={styles.versusTeam}>{RIVALRY.you.team}</Text>
            <Text style={[styles.versusScore, youLead && styles.versusScoreLead]}>
              {yourLive.toFixed(1)}
            </Text>
            <Text style={styles.projLabel}>PROJ {RIVALRY.you.proj.toFixed(1)}</Text>
          </View>

          <Text style={styles.versusDivider}>VS</Text>

          <View style={styles.versusSide}>
            <View style={styles.versusAvatar}>
              <Text style={styles.avatarText}>{getInitials(RIVALRY.rival.name)}</Text>
            </View>
            <Text style={styles.versusName}>{RIVALRY.rival.name}</Text>
            <Text style={styles.versusTeam}>{RIVALRY.rival.team}</Text>
            <Text style={[styles.versusScore, !youLead && styles.versusScoreLead]}>
              {rivalLive.toFixed(1)}
            </Text>
            <Text style={styles.projLabel}>PROJ {RIVALRY.rival.proj.toFixed(1)}</Text>
          </View>
        </View>

        {/* Projection bar */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardMeta}>PROJECTED FINISH</Text>
            <Text style={styles.cardMeta}>
              {Math.abs(RIVALRY.you.proj - RIVALRY.rival.proj).toFixed(1)} PTS APART
            </Text>
          </View>
          <View style={styles.projTrack}>
            <View
              style={[styles.projFill, { width: `${(RIVALRY.you.proj / total) * 100}%` }]}
            />
          </View>
          <View style={[commonStyles.row, { marginTop: 8 }]}>
            <Text style={styles.projLabel}>{RIVALRY.you.name}</Text>
            <Text style={styles.projLabel}>{RIVALRY.rival.name}</Text>
          </View>
        </View>

        {/* Pick-by-pick */}
        <View style={[styles.cardHeader, { marginTop: 24 }]}>
          <Text style={styles.cardTitle}>Pick by Pick</Text>
          <Text style={styles.cardMeta}>{MATCHUP_PICKS.length} BOUTS</Text>
        </View>

        {MATCHUP_PICKS.length === 0 && (
          <View style={styles.card}>
            <EmptyState
              compact
              icon="list-outline"
              title="No picks locked in"
              message="Bouts appear here once you and your opponent submit picks."
            />
          </View>
        )}

        {MATCHUP_PICKS.map((p) => {
          const settled = p.status === "FINAL";
          const youWonBout = settled && p.yourPoints > p.rivalPoints;
          const rivalWonBout = settled && p.rivalPoints > p.yourPoints;
          return (
            <View key={p.id} style={styles.boutRow}>
              <View style={styles.boutHeader}>
                <Text style={styles.boutName}>{p.bout}</Text>
                <StatusPill status={p.status} />
              </View>

              <View style={{ flexDirection: "row" }}>
                <View style={styles.pickSide}>
                  <Text style={styles.pickName}>{p.yourPick}</Text>
                  <Text style={styles.pickMethod}>{p.yourMethod}</Text>
                  <Text
                    style={[
                      styles.pickPoints,
                      youWonBout && styles.pickWinner,
                      !settled && styles.pickPointsDim,
                    ]}
                  >
                    {settled ? p.yourPoints.toFixed(1) : "—"}
                  </Text>
                </View>

                <View style={styles.boutSpacer} />

                <View style={[styles.pickSide, { alignItems: "flex-end" }]}>
                  <Text style={styles.pickName}>{p.rivalPick}</Text>
                  <Text style={styles.pickMethod}>{p.rivalMethod}</Text>
                  <Text
                    style={[
                      styles.pickPoints,
                      rivalWonBout && styles.pickWinner,
                      !settled && styles.pickPointsDim,
                    ]}
                  >
                    {settled ? p.rivalPoints.toFixed(1) : "—"}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
