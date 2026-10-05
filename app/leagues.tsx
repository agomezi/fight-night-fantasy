import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import HeaderBar from "../components/HeaderBar";
import LeaderboardRow from "../components/LeaderboardRow";
import LeagueStandingRow from "../components/LeagueStandingRow";
import MatchupCard from "../components/MatchupCard";
import PressableScale from "../components/PressableScale";
import ProgressRing from "../components/ProgressRing";
import SwipeableCards from "../components/SwipeableCards";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useLeague } from "../hooks/useLeague";
import { loadLeaderboard, type Leaderboard } from "../services/leaderboard";
import {
  currentWeek,
  inviteMessage,
  MIN_MEMBERS,
  rankLabel,
  TIER_LABEL,
  type LeagueStandings,
  type MyLeague,
} from "../services/leagues";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

function ordinal(n: number) {
  const t = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (t[(v - 20) % 10] ?? t[v] ?? t[0]);
}

/** Why a league has no table yet, in a line. Null once it is ranked. */
function waitingLine(league: MyLeague, standings: LeagueStandings | null): string | null {
  if (standings?.ranked && league.status !== "queued") return null;
  if (league.members < MIN_MEMBERS) {
    const more = MIN_MEMBERS - league.members;
    return `Invite ${more} more to play — a league needs ${MIN_MEMBERS} when the season starts.`;
  }
  if (standings?.season === "PRE-SEASON") return "Season 1 hasn't started. Everyone here is in when it does.";
  return "You join the rotation when the next season starts.";
}

export default function Leagues() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);
  const state = useLeague();

  // The global table: the top five and, if you're further down, you.
  const [board, setBoard] = useState<Leaderboard | null>(null);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      loadLeaderboard(5).then((b) => current && setBoard(b)).catch(() => {});
      return () => {
        current = false;
      };
    }, [])
  );

  const globalCard = board && board.rows.length > 0 && (
    <Animated.View entering={appear(3)} style={styles.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={styles.cardTitle}>Global leaderboard</Text>
        <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>{board.season}</Text>
      </View>
      {board.rows.map((row, i) => (
        <LeaderboardRow key={row.userId} row={row} index={i} last={i === board.rows.length - 1} />
      ))}
      <PressableScale onPress={() => router.push("/leaderboard")} style={{ paddingTop: 12, alignItems: "center" }}>
        <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: "700" }}>See the full leaderboard →</Text>
      </PressableScale>
    </Animated.View>
  );

  const shell = (children: React.ReactNode) => (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
      >
        <HeaderBar />
        {children}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav active="leagues" />
      </View>
    </SafeAreaView>
  );

  if (state.status === "loading") {
    return shell(<ActivityIndicator color={c.red} style={{ marginTop: 80 }} />);
  }

  if (state.status === "error") {
    return shell(
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load your leagues"
        message={state.message}
        actionLabel="TRY AGAIN"
        onAction={state.reload}
      />
    );
  }

  const { league, leagues, standings, weeks } = state;

  // No league joined yet — the whole screen becomes an onboarding prompt.
  if (!league) {
    return shell(
      <>
        <Animated.Text entering={appear(0)} style={styles.eyebrow}>
          LEAGUES
        </Animated.Text>
        <Animated.Text entering={appear(1)} style={styles.leagueName}>
          No League Yet
        </Animated.Text>
        <Animated.View entering={appear(2)} style={styles.memberRow}>
          <Ionicons name="people-outline" size={15} color={c.textMuted} />
          <Text style={styles.memberText}>You are not in a league</Text>
        </Animated.View>

        <Animated.View entering={appear(3)} style={styles.card}>
          <EmptyState
            icon="trophy-outline"
            title="Start competing"
            message="Create a league and invite friends, or join one with an invite code. Every card is a head-to-head against someone in your league."
          />
          <PressableScale style={styles.primaryButton} onPress={() => router.push("/league-join?mode=create")}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>CREATE A LEAGUE</Text>
          </PressableScale>
          <PressableScale style={styles.ghostButton} onPress={() => router.push("/league-join?mode=join")}>
            <Text style={styles.ghostButtonText}>JOIN WITH A CODE</Text>
          </PressableScale>
        </Animated.View>

        {globalCard}

        <Animated.View entering={appear(4)} style={styles.card}>
          <Text style={styles.cardTitle}>What you unlock</Text>
          {[
            { icon: "flash-outline" as const, text: "A head-to-head against a league-mate every card" },
            { icon: "podium-outline" as const, text: "A season table ranked on your W-L record" },
            { icon: "shield-checkmark-outline" as const, text: "A tier for your league — Casual, Amateur or Pro" },
          ].map((row, i) => (
            <Animated.View key={row.text} entering={appear(5 + i)} style={styles.riserRow}>
              <View style={styles.avatar}>
                <Ionicons name={row.icon} size={18} color={c.textFaint} />
              </View>
              <View style={styles.playerCell}>
                <Text style={styles.playerName}>{row.text}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>
      </>
    );
  }

  const me = standings?.me ?? null;
  const ranked = standings?.rows.filter((r) => r.rank != null).length ?? 0;
  const waiting = waitingLine(league, standings);
  const week = currentWeek(weeks);
  const myMatchup = week?.matchups.find((m) => m.isMine) ?? null;

  const invite = () => {
    Share.share({ message: inviteMessage(league) }).catch(() => {});
  };

  return shell(
    <>
      {/* Your leagues, when there is more than one, and a way to add another. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
      >
        {leagues.map((l) => {
          const active = l.id === league.id;
          return (
            <PressableScale
              key={l.id}
              onPress={() => state.select(l.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: active ? c.red : c.borderStrong,
                backgroundColor: active ? c.redTint : "transparent",
              }}
            >
              <Text style={{ color: active ? c.text : c.text2, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                {l.name}
              </Text>
            </PressableScale>
          );
        })}
        <PressableScale
          onPress={() => router.push("/league-join")}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.borderStrong,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons name="add" size={15} color={c.text2} />
          <Text style={{ color: c.text2, fontSize: 13, fontWeight: "700" }}>New</Text>
        </PressableScale>
      </ScrollView>

      <SwipeableCards
        minHeight={252}
        cards={[
          {
            tag: `${TIER_LABEL[league.tier].toUpperCase()} LEAGUE`,
            tagColor: "#E8A020",
            serial: standings?.season,
            content: (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                <ProgressRing
                  value={me?.rank != null ? ranked - me.rank + 1 : 0}
                  total={Math.max(ranked, 1)}
                  center={me?.rank != null ? (me.tied ? rankLabel(me.rank, true) : ordinal(me.rank)) : "—"}
                  caption={me?.rank != null ? `of ${ranked}` : "unranked"}
                  size={116}
                  color="#E8A020"
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 21, fontWeight: "800" }}>{league.name}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>
                    {[me?.rank != null ? me.record : null, `${(me?.points ?? 0).toLocaleString()} pts`, `${league.members} members`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {waiting && (
                    <Text style={{ color: c.text2, fontSize: 12.5, lineHeight: 18, marginTop: 8 }}>{waiting}</Text>
                  )}
                </View>
              </View>
            ),
          },
          ...(week && myMatchup
            ? [
                {
                  tag: week.state === "live" ? "LIVE NOW" : week.state === "final" ? `WEEK ${week.week} RESULT` : "THIS WEEK",
                  tagColor: c.red,
                  serial: week.eventName ?? undefined,
                  content: (
                    <View style={{ gap: 12 }}>
                      <MatchupCard matchup={myMatchup} />
                      <PressableScale
                        onPress={() => router.push(`/matchup?id=${league.id}`)}
                        style={{ backgroundColor: c.red, borderRadius: 10, paddingVertical: 11, alignItems: "center" }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>
                          VIEW ALL MATCHUPS
                        </Text>
                      </PressableScale>
                    </View>
                  ),
                },
              ]
            : []),
        ]}
      />

      <View style={styles.actionRow}>
        <PressableScale style={styles.actionButton} onPress={invite}>
          <Ionicons name="person-add-outline" size={15} color={c.text} />
          <Text style={styles.actionButtonText}>INVITE</Text>
        </PressableScale>
        <PressableScale style={styles.actionButton} onPress={() => router.push(`/league-settings?id=${league.id}`)}>
          <Ionicons name="settings-outline" size={15} color={c.text} />
          <Text style={styles.actionButtonText}>SETTINGS</Text>
        </PressableScale>
      </View>

      {/* Standings preview — data, so no box. */}
      <View style={{ marginTop: 22 }}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Standings</Text>
          <Text style={styles.cardMeta}>{week ? `WEEK ${week.week}` : standings?.season}</Text>
        </View>

        {standings && standings.rows.length > 0 ? (
          <>
            <View style={styles.columnHeader}>
              <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
              <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>PLAYER</Text>
              <Text style={styles.columnLabel}>PTS</Text>
            </View>
            {standings.rows.slice(0, 4).map((row, i) => (
              <LeagueStandingRow key={row.userId} row={row} index={i} />
            ))}
          </>
        ) : (
          <EmptyState compact icon="podium-outline" title="No standings yet" message="The table fills in once the season starts." />
        )}

        <PressableScale style={styles.ghostButton} onPress={() => router.push(`/league-standings?id=${league.id}`)}>
          <Text style={styles.ghostButtonText}>VIEW FULL STANDINGS</Text>
        </PressableScale>
      </View>

      {globalCard}
    </>
  );
}
