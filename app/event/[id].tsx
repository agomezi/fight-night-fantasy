import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import CardMark from "../../components/CardMark";
import FightCard from "../../components/FightCard";
import LiveDot from "../../components/LiveDot";
import PressableScale from "../../components/PressableScale";
import ResultRow from "../../components/ResultRow";
import Skeleton from "../../components/Skeleton";
import { appear } from "../../constants/motion";
import { useTheme, useThemedStyles } from "../../context/ThemeContext";
import { useEventDetail } from "../../hooks/useEventDetail";
import type { BoutLine } from "../../services/eventDetail";
import { countdown, startLabel } from "../../services/events";
import { makeCommonStyles } from "../../styles/common";

/*
 * One card, live. Every bout in the order it's fought from the top of the
 * bill down, the fight in the cage marked LIVE, each result with its round
 * and time, and your call against it. Refreshes itself while the card is on.
 */

const META: Record<BoutLine["state"], string> = {
  upcoming: "Upcoming",
  live: "Live",
  pending: "Pending",
  provisional: "Provisional",
  final: "Final",
  void: "Void",
  cancelled: "Cancelled",
};
const SHORT: Record<string, string> = { "KO/TKO": "KO/TKO", Submission: "SUB", Decision: "DEC" };

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c, mode } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const state = useEventDetail(id);
  const detail = state.status === "ready" ? state.detail : null;

  const statusLabel = !detail
    ? ""
    : detail.status === "live"
      ? "LIVE NOW"
      : detail.status === "final"
        ? detail.provisional
          ? "AWAITING OFFICIAL RESULTS"
          : "FINAL"
        : detail.status === "cancelled"
          ? "CANCELLED"
          : "UPCOMING";
  const toStart = detail && detail.status === "upcoming" ? countdown(detail.startsAt, new Date()) : null;

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo} numberOfLines={1}>
            {detail?.title ?? "Event"}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        {state.status === "loading" ? (
          <View style={{ gap: 14 }}>
            <Skeleton height={150} radius={14} />
            <Skeleton height={64} radius={10} />
            <Skeleton height={64} radius={10} />
          </View>
        ) : !detail ? (
          <Text style={{ color: c.textMuted, fontSize: 14, paddingTop: 20 }}>
            {state.status === "error" ? "Couldn't load this card. Try again in a moment." : "This card isn't available."}
          </Text>
        ) : (
          <>
            <Animated.View entering={appear(0)}>
              <FightCard
                label={statusLabel}
                labelColor={detail.status === "live" ? c.red : c.textMuted}
                serial={detail.status === "upcoming" ? startLabel(detail.startsAt) : `${detail.picked} PICKED`}
                mark={<CardMark name="glove" color={mode === "dark" ? c.textMuted : c.red} opacity={1} top={44} />}
              >
                {detail.headline && (
                  <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 6 }}>{detail.headline}</Text>
                )}
                {detail.status === "upcoming" ? (
                  <Text style={{ color: c.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.8 }}>
                    {toStart
                      ? toStart.days > 0
                        ? `Starts in ${toStart.days}d ${toStart.hours}h`
                        : `Starts in ${toStart.hours}h ${toStart.minutes}m`
                      : "Starting soon"}
                  </Text>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                      {detail.status === "live" && (
                        <View style={{ marginBottom: 16 }}>
                          <LiveDot />
                        </View>
                      )}
                      <Text style={{ color: c.text, fontSize: 46, fontWeight: "800", letterSpacing: -1.5, fontVariant: ["tabular-nums"] }}>
                        {signed(detail.points)}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 10 }}>pts</Text>
                    </View>
                    <Text style={{ color: c.textMuted, fontSize: 13 }}>
                      {detail.hit} of {detail.total} called
                      {detail.provisional ? " · some results may still change" : ""}
                    </Text>
                  </>
                )}
              </FightCard>
            </Animated.View>

            {detail.sections.map((section, si) => (
              <View key={`${section.label}-${si}`}>
                <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 28, marginBottom: 2 }}>
                  {section.label}
                  {section.locked ? (
                    <Text style={{ color: c.red }}>  · LOCKED</Text>
                  ) : (
                    `  · LOCKS ${startLabel(section.locksAt).split(" · ")[1]}`
                  )}
                </Text>
                {section.bouts.map((b, bi) => {
                  const [method, detailText] = (b.result ?? "").split(" · ");
                  const winnerMethod = b.state === "final" || b.state === "provisional" ? SHORT[method] ?? method : undefined;
                  return (
                    <ResultRow
                      key={b.id}
                      index={Math.min(bi + 1, 6)}
                      red={{ initials: b.red.initials, name: b.red.name, method: b.red.won ? winnerMethod : undefined }}
                      blue={{ initials: b.blue.initials, name: b.blue.name, method: b.blue.won ? winnerMethod : undefined }}
                      settled={b.state === "final" || b.state === "provisional"}
                      live={b.state === "live"}
                      meta={b.state === "void" ? (b.result ?? META.void) : META[b.state]}
                      detail={detailText}
                      points={b.points ?? undefined}
                      verdict={b.verdict ?? "none"}
                      verdictNote={b.pick ? (b.verdict === "void" ? `${b.pick} · VOID` : b.pick) : undefined}
                      last={bi === section.bouts.length - 1}
                    />
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
