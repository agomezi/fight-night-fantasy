import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
} from "react-native-reanimated";
import AnimatedBar from "../components/AnimatedBar";
import CardMark from "../components/CardMark";
import FightCard from "../components/FightCard";
import PressableScale from "../components/PressableScale";
import ResultRow from "../components/ResultRow";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useHistory } from "../hooks/useHistory";
import { useToggleProgress } from "../hooks/useToggleProgress";
import Skeleton from "../components/Skeleton";
import { makeCommonStyles } from "../styles/common";

/** Disclosure arrow that rotates open. */
function Chevron({ open }: { open: boolean }) {
  const { c } = useTheme();
  const progress = useToggleProgress(open);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={16} color={c.textMuted} />
    </Animated.View>
  );
}

export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const state = useHistory();
  const history = state.status === "ready" ? state.history : null;
  const past = history?.events ?? [];
  const season = history?.season;

  // Most recent event opens by default — it's the one you came to check.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === past[0]?.id;
  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !isOpen(id) }));

  const accuracy = season && season.total > 0 ? Math.round((season.hit / season.total) * 100) : null;

  // Filter strip of past events — moved here from picks, where switching
  // events did nothing useful. Here it is the whole point of the screen.
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? past.filter((e) => e.id === filter) : past;

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
      >
        <View style={commonStyles.row}>
          <PressableScale onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </PressableScale>
          <Text style={commonStyles.headerLogo}>History</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={commonStyles.divider} />

        {!history ? (
          state.status === "error" ? (
            <Text style={{ color: c.textMuted, fontSize: 14, paddingTop: 40 }}>
              Couldn&apos;t load your history. Pull back in a moment.
            </Text>
          ) : (
            <View style={{ paddingTop: 20, gap: 14 }}>
              <Skeleton height={150} radius={14} />
              <Skeleton height={64} radius={10} />
              <Skeleton height={64} radius={10} />
            </View>
          )
        ) : past.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
              Nothing here yet
            </Text>
            <Text
              style={{ color: c.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 }}
            >
              Play an event and it lands here — every bout you called, what
              actually happened, and what it scored you.
            </Text>
            <PressableScale
              onPress={() => router.push("/picks")}
              style={{
                marginTop: 22,
                backgroundColor: c.red,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontWeight: "800",
                  letterSpacing: 1,
                }}
              >
                MAKE YOUR PICKS
              </Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {/* season summary */}
            <Animated.View entering={appear(0)}>
              <FightCard
                label={season!.label}
                labelColor={c.red}
                serial={`${season!.events} EVENT${season!.events === 1 ? "" : "S"}`}
                mark={<CardMark name="octagon" top={44} />}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <Text
                    style={{
                      color: c.text,
                      fontSize: 46,
                      fontWeight: "800",
                      letterSpacing: -1.5,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {season!.points.toLocaleString()}
                  </Text>
                  <Text
                    style={{ color: c.textMuted, fontSize: 13, marginBottom: 10 }}
                  >
                    pts
                  </Text>
                </View>

                <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>
                  {season!.hit} of {season!.total} bouts called
                  {accuracy != null ? ` · ${accuracy}% accuracy` : ""}
                </Text>

                <AnimatedBar percent={accuracy ?? 0} style={{ marginTop: 14 }} />
              </FightCard>
            </Animated.View>

            <Text
              style={{
                color: c.textMuted,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.4,
                marginTop: 30,
              }}
            >
              PAST EVENTS
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
            >
              {[{ id: null, name: "All" }, ...past].map((e) => {
                const on = filter === e.id;
                return (
                  <PressableScale
                    key={e.id ?? "all"}
                    onPress={() => setFilter(e.id)}
                    scaleTo={0.95}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: on ? c.red : c.borderStrong,
                      backgroundColor: on ? c.redTint : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: on ? c.red : c.textMuted,
                        fontSize: 12.5,
                        fontWeight: "700",
                      }}
                    >
                      {e.name}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {shown.map((e, i) => {
              const expanded = isOpen(e.id);
              const pct = e.total > 0 ? Math.round((e.hit / e.total) * 100) : null;
              const status = e.live ? "LIVE" : e.provisional ? "PROVISIONAL" : null;

              return (
                <Animated.View
                  key={e.id}
                  entering={appear(i + 1)}
                  layout={LinearTransition.duration(220)}
                >
                  <PressableScale
                    onPress={() => toggle(e.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 16,
                      borderBottomWidth: expanded ? 0 : 1,
                      borderBottomColor: c.border,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: "BebasNeue",
                          fontSize: 24,
                          color: c.text,
                          letterSpacing: 1,
                        }}
                      >
                        {e.name}
                      </Text>
                      <Text style={{ color: c.textFaint, fontSize: 12, marginTop: -2 }}>
                        {e.date} · {e.hit} of {e.total} called{status ? ` · ${status}` : ""}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: 17,
                          fontWeight: "800",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {e.points > 0 ? `+${e.points}` : e.points < 0 ? `−${-e.points}` : "0"}
                      </Text>
                      <Text
                        style={{
                          color: pct != null && pct >= 60 ? c.green : c.textMuted,
                          fontSize: 11,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {pct != null ? `${pct}%` : "—"}
                      </Text>
                    </View>

                    <Chevron open={expanded} />
                  </PressableScale>

                  {expanded && (
                    <Animated.View
                      entering={FadeIn.duration(180)}
                      exiting={FadeOut.duration(120)}
                      style={{
                        paddingBottom: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: c.border,
                      }}
                    >
                      {e.bouts.map((b, bi) => (
                        <ResultRow
                          key={b.id}
                          index={bi}
                          red={b.red}
                          blue={b.blue}
                          meta={b.meta}
                          detail={b.detail}
                          points={b.points}
                          verdict={b.verdict}
                          verdictNote={b.voidNote ? `${b.pick} · ${b.voidNote}` : b.pick}
                          settled={b.settled}
                          last={bi === e.bouts.length - 1}
                        />
                      ))}
                    </Animated.View>
                  )}
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
