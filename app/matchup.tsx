import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import LiveDot from "../components/LiveDot";
import MatchupCard from "../components/MatchupCard";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useLeague } from "../hooks/useLeague";
import { currentWeek, type Matchup, type MatchupState } from "../services/leagues";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

function StatusPill({ state }: { state: MatchupState }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const color = state === "live" ? c.red : state === "final" ? c.textFaint : c.blue;
  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusPillText, { color }]}>{state.toUpperCase()}</Text>
    </View>
  );
}

/** Someone else's matchup that week, on one line. */
function OtherMatchup({ m, index }: { m: Matchup; index: number }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const score = (points: number | null, won: boolean) => (
    <Text style={[styles.pickPoints, won && styles.pickWinner, points == null && styles.pickPointsDim]}>
      {points == null ? "—" : points}
    </Text>
  );
  if (!m.b) {
    return (
      <Animated.View entering={appear(index)} style={styles.boutRow}>
        <Text style={{ color: c.textMuted, fontSize: 13.5 }}>{m.a.name} has the bye</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={appear(index)} style={[styles.boutRow, { flexDirection: "row", alignItems: "center" }]}>
      <View style={[styles.pickSide, { flex: 1 }]}>
        <Text style={styles.pickName} numberOfLines={1}>{m.a.name}</Text>
        {score(m.a.points, m.winnerId === m.a.userId)}
      </View>
      <Text style={{ color: c.textFaint, fontSize: 11, fontWeight: "800", marginHorizontal: 10 }}>VS</Text>
      <View style={[styles.pickSide, { flex: 1, alignItems: "flex-end" }]}>
        <Text style={styles.pickName} numberOfLines={1}>{m.b.name}</Text>
        {score(m.b.points, m.winnerId === m.b.userId)}
      </View>
    </Animated.View>
  );
}

export default function MatchupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);
  const state = useLeague(id);
  const [picked, setPicked] = useState<number | null>(null);

  const weeks = state.status === "ready" ? state.weeks : [];
  const week = weeks.find((w) => w.week === picked) ?? currentWeek(weeks);
  const mine = week?.matchups.find((m) => m.isMine) ?? null;
  const others = week?.matchups.filter((m) => !m.isMine) ?? [];

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
      >
        <View style={styles.screenHeader}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          {week?.state === "live" && (
            <View style={styles.liveRow}>
              <LiveDot />
              <Text style={styles.liveText}>{week.eventName ?? "THIS CARD"} · LIVE</Text>
            </View>
          )}
          <View style={{ width: 26 }} />
        </View>

        <Text style={styles.screenTitle}>HEAD TO HEAD</Text>
        {state.status === "ready" && state.league && (
          <Text style={styles.screenSub}>{state.league.name}</Text>
        )}

        {state.status === "loading" && <ActivityIndicator color={c.red} style={{ marginTop: 40 }} />}
        {state.status === "error" && (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load the matchups" message={state.message}
            actionLabel="TRY AGAIN" onAction={state.reload} />
        )}

        {state.status === "ready" && !week && (
          <View style={styles.card}>
            <EmptyState
              icon="flash-outline"
              title="No matchups yet"
              message="Head-to-heads start when the season does, once the league has at least four players."
              actionLabel="MAKE YOUR PICKS"
              onAction={() => router.push("/picks")}
            />
          </View>
        )}

        {week && (
          <>
            {/* Every week so far, and the next one. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 16 }}>
              {weeks.map((w) => {
                const active = w.week === week.week;
                return (
                  <PressableScale
                    key={w.week}
                    onPress={() => setPicked(w.week)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: active ? c.red : c.borderStrong,
                      backgroundColor: active ? c.redTint : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? c.text : c.text2, fontSize: 13, fontWeight: "700" }}>
                      Week {w.week}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <View style={[styles.cardHeader, { marginTop: 18 }]}>
              <Text style={styles.cardMeta} numberOfLines={1}>{week.eventName?.toUpperCase() ?? "NEXT CARD"}</Text>
              <StatusPill state={week.state} />
            </View>

            {mine ? (
              <MatchupCard matchup={mine} />
            ) : (
              <Text style={{ color: c.textMuted, fontSize: 13.5, marginTop: 14 }}>
                You aren&apos;t in the rotation this season — here&apos;s how everyone else is doing.
              </Text>
            )}

            {week.state === "upcoming" && (
              <Text style={{ color: c.textFaint, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
                Points show once the card locks. Your league plays this card at its tier.
              </Text>
            )}

            {others.length > 0 && (
              <>
                <View style={[styles.cardHeader, { marginTop: 26 }]}>
                  <Text style={styles.cardTitle}>Around the league</Text>
                  <Text style={styles.cardMeta}>WEEK {week.week}</Text>
                </View>
                {others.map((m, i) => (
                  <OtherMatchup key={`${m.a.userId}-${m.b?.userId ?? "bye"}`} m={m} index={i} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
