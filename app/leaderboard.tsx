import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import LeaderboardRow from "../components/LeaderboardRow";
import MemberProfileSheet from "../components/MemberProfileSheet";
import PressableScale from "../components/PressableScale";
import Skeleton from "../components/Skeleton";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { loadLeaderboard, type Leaderboard } from "../services/leaderboard";
import { makeCommonStyles } from "../styles/common";

/*
 * Everyone's season, ranked by edge, accuracy breaking ties, your own
 * row always shown even outside the top 100. Tapping a player opens their
 * card, the same as in a league, with report and block behind its menu.
 */
export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      loadLeaderboard()
        .then((b) => current && (setBoard(b), setFailed(false)))
        .catch(() => current && setFailed(true));
      return () => {
        current = false;
      };
    }, [])
  );

  // Your row sits in rank order when you're in the top 100, and at the foot
  // of the table, after a gap, when you're not.
  // Unranked players follow everyone ranked, so it goes by position.
  const meAt = board?.rows.findIndex((r) => r.isMe) ?? -1;
  const top = board?.rows.filter((r, i) => !r.isMe || i < 100) ?? [];
  const meBelow = board?.me && meAt >= 100 ? board.me : null;

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo}>Leaderboard</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        {!board ? (
          failed ? (
            <Text style={{ color: c.textMuted, fontSize: 14, paddingTop: 20 }}>Couldn&apos;t load the leaderboard. Try again in a moment.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={46} radius={10} />
              ))}
            </View>
          )
        ) : board.rows.length === 0 ? (
          <EmptyState
            icon="podium-outline"
            title="No one ranked yet"
            message="The leaderboard fills in once players who picked a whole main card have been scored."
          />
        ) : (
          <>
            <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>{board.season}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
              Ranked by edge: points above the average player on the same fights. Only cards where you picked the whole main card count.
            </Text>
            <Animated.View entering={appear(1)}>
              {top.map((row, i) => (
                <LeaderboardRow
                  key={row.userId}
                  row={row}
                  last={i === top.length - 1}
                  onPress={() => setViewing(row.userId)}
                />
              ))}
            </Animated.View>
            {/* How far you are from the next place up. */}
            {board.me?.rank != null && board.me.edge != null && board.me.rank > 1 && (() => {
              const meAt = board.rows.findIndex((r) => r.isMe);
              const above = meAt > 0 ? board.rows.slice(0, meAt).reverse().find((r) => r.rank != null && r.rank < board.me!.rank! && r.edge != null) : undefined;
              // Past the top 100 the row above isn't loaded; don't name the wrong one.
              if (!above || above.edge == null || meAt >= 100) return null;
              const gap = above.edge - board.me!.edge! + 1;
              return (
                <Text style={{ color: c.text2, fontSize: 13, textAlign: "center", paddingTop: 16 }}>
                  {gap} edge to pass {above.name} for #{above.rank}
                </Text>
              );
            })()}
            {(!board.me || board.me.rank == null) && (
              <Text style={{ color: c.textMuted, fontSize: 13, textAlign: "center", paddingTop: 16 }}>
                You&apos;re not on the board yet. Pick a whole main card and it counts.
              </Text>
            )}
            {meBelow && (
              <>
                <Text style={{ color: c.textFaint, textAlign: "center", paddingVertical: 8 }}>⋯</Text>
                <LeaderboardRow row={meBelow} last onPress={() => setViewing(meBelow.userId)} />
              </>
            )}
          </>
        )}
      </ScrollView>
      <View style={{ height: insets.bottom }} />
      <MemberProfileSheet leagueId={null} userId={viewing} onClose={() => setViewing(null)} />
    </SafeAreaView>
  );
}
