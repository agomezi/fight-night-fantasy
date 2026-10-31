import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "../components/EmptyState";
import LeagueStandingRow from "../components/LeagueStandingRow";
import MemberProfileSheet from "../components/MemberProfileSheet";
import PressableScale from "../components/PressableScale";
import { EmptyScorecard } from "../components/Scorecard";
import { ChampRow, TitleShotLine } from "../components/TitleRows";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useEntranceOnce } from "../hooks/useEntranceOnce";
import { useLeague } from "../hooks/useLeague";
import { inviteMessage, matchupStreaks, TIER_LABEL } from "../services/leagues";
import { hasTitle, titleShotCut } from "../services/titleFights";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";
import ScreenSkeleton from "../components/ScreenSkeleton";

export default function LeagueStandings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);
  const state = useLeague(id);
  const [viewing, setViewing] = useState<string | null>(null);

  const league = state.status === "ready" ? state.league : null;
  const standings = state.status === "ready" ? state.standings : null;
  const rows = standings?.rows ?? [];
  const unranked = rows.filter((r) => r.rank == null);
  const weeks = state.status === "ready" ? state.weeks : null;
  const streaks = useMemo(() => (weeks ? matchupStreaks(weeks) : {}), [weeks]);
  const animate = useEntranceOnce(state.status === "ready");
  const { session } = useAuth();
  const title = state.status === "ready" ? state.title ?? null : null;
  const showTitle = hasTitle(title) && !!standings?.ranked;
  // Until the field is set, a line under the places that would make it.
  const cut = showTitle ? titleShotCut(title) : null;
  const seedOf = (userId: string) =>
    showTitle && title.seedsFinal ? title.seeds.find((s) => s.userId === userId)?.seed : undefined;

  const invite = () => {
    if (league) Share.share({ message: inviteMessage(league) }).catch(() => {});
  };

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
          {league && (
            <PressableScale onPress={invite} hitSlop={12}>
              <Ionicons name="person-add-outline" size={22} color={c.red} />
            </PressableScale>
          )}
        </View>

        <Text style={styles.screenTitle}>{league ? league.name.toUpperCase() : "STANDINGS"}</Text>
        <Text style={styles.screenSub}>
          {league
            ? `${league.members} Members · ${TIER_LABEL[league.tier]} · ${standings?.season ?? ""}`
            : state.status === "loading"
              ? " "
              : "No league joined"}
        </Text>
        <Text style={styles.screenNote}>
          Ranked by record. Ties go to most points, then accuracy, then head-to-head. After card 8 the top five
          (top four in a league of four or five) get a title shot: a bracket over cards 9 and 10, then the title
          fight on card 11.
        </Text>

        {state.status === "loading" && <ScreenSkeleton variant="list" rows={8} />}
        {state.status === "error" && (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load the standings" message={state.message}
            actionLabel="TRY AGAIN" onAction={state.reload} />
        )}

        {state.status === "ready" && (
          <View style={{ marginTop: 22 }}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{standings?.ranked ? "Season Table" : "Members"}</Text>
              <Text style={styles.cardMeta}>{rows.length} PLAYERS</Text>
            </View>

            {rows.length === 0 ? (
              <EmptyScorecard rows={4} caption="Join a league and make your first picks — the table fills from there." />
            ) : (
              <>
                <View style={styles.columnHeader}>
                  <Text style={[styles.columnLabel, { width: 42, textAlign: "center" }]}>RNK</Text>
                  <Text style={[styles.columnLabel, { flex: 1, marginLeft: 12 }]}>PLAYER</Text>
                  <Text style={styles.columnLabel}>W-L</Text>
                </View>
                {showTitle && <ChampRow title={title} myId={session?.user.id} onPress={setViewing} />}
                {rows.map((row, i) => (
                  <View key={row.userId}>
                    <LeagueStandingRow
                      row={row}
                      index={i}
                      move={state.moves[row.userId]}
                      streak={streaks[row.userId]}
                      animate={animate}
                      crowned={showTitle && !!title.champion}
                      seed={seedOf(row.userId)}
                      interim={!!standings?.ranked && title?.interim?.userId === row.userId}
                      onPress={() => setViewing(row.userId)}
                    />
                    {cut === row.userId && i < rows.length - 1 && <TitleShotLine />}
                  </View>
                ))}
              </>
            )}

            {unranked.some((r) => r.status === "queued") && standings?.ranked && (
              <Text style={{ color: c.textFaint, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
                Players marked NEXT SEASON joined mid-season. Their points count globally now and they join the
                rotation when the next season starts.
              </Text>
            )}
          </View>
        )}

        {league && (
          <PressableScale style={styles.primaryButton} onPress={invite}>
            <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>INVITE FRIENDS</Text>
          </PressableScale>
        )}
      </ScrollView>

      <View style={{ height: insets.bottom }} />
      {league && <MemberProfileSheet leagueId={league.id} userId={viewing} onClose={() => setViewing(null)} />}
    </SafeAreaView>
  );
}
