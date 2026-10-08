import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import LeaderboardRow from "../components/LeaderboardRow";
import PressableScale from "../components/PressableScale";
import Skeleton from "../components/Skeleton";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { loadLeaderboard, reportName, type Leaderboard, type LeaderboardRow as Row } from "../services/leaderboard";
import { makeCommonStyles } from "../styles/common";

/*
 * Everyone's season, ranked. Points first, accuracy breaking ties, your own
 * row always shown even outside the top 100. Tapping another player offers
 * to report their name.
 */
export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [failed, setFailed] = useState(false);

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

  const report = (row: Row) => {
    Alert.alert(row.name, "Report this name as offensive or inappropriate?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report name",
        style: "destructive",
        onPress: () =>
          reportName(row.userId)
            .then(() => Alert.alert("Thanks", "We'll review it."))
            .catch((e) =>
              Alert.alert("Couldn't send the report", e instanceof Error ? e.message : "Please try again.")
            ),
      },
    ]);
  };

  // Your row sits in rank order when you're in the top 100, and at the foot
  // of the table, after a gap, when you're not.
  const top = board?.rows.filter((r) => !r.isMe || r.rank <= 100) ?? [];
  const meBelow = board?.me && board.me.rank > 100 ? board.me : null;

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
          <EmptyState icon="podium-outline" title="No scores yet" message="The leaderboard fills in once the first card of the season is scored." />
        ) : (
          <>
            <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>{board.season}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4, marginBottom: 10 }}>
              Ranked by points · accuracy breaks ties
            </Text>
            {top.map((row, i) => (
              <LeaderboardRow
                key={row.userId}
                row={row}
                index={i}
                last={i === top.length - 1}
                onPress={row.isMe ? undefined : () => report(row)}
              />
            ))}
            {meBelow && (
              <>
                <Text style={{ color: c.textFaint, textAlign: "center", paddingVertical: 8 }}>⋯</Text>
                <LeaderboardRow row={meBelow} last />
              </>
            )}
          </>
        )}
      </ScrollView>
      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
