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
import { PAST_EVENTS } from "../constants/league";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useToggleProgress } from "../hooks/useToggleProgress";
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
  // Most recent event opens by default — it's the one you came to check.
  const [open, setOpen] = useState<Record<string, boolean>>(
    PAST_EVENTS.length > 0 ? { [PAST_EVENTS[0].id]: true } : {},
  );

  const events = PAST_EVENTS.length;
  const totalPoints = PAST_EVENTS.reduce((sum, e) => sum + e.points, 0);
  const totalHit = PAST_EVENTS.reduce((sum, e) => sum + e.hit, 0);
  const totalPicked = PAST_EVENTS.reduce((sum, e) => sum + e.total, 0);
  const accuracy = totalPicked > 0 ? Math.round((totalHit / totalPicked) * 100) : 0;

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

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

        {PAST_EVENTS.length === 0 ? (
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
            {/* career summary */}
            <Animated.View entering={appear(0)}>
              <FightCard
                label="ALL TIME"
                labelColor={c.red}
                serial={`${events} EVENT${events === 1 ? "" : "S"}`}
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
                    {accuracy}%
                  </Text>
                  <Text
                    style={{ color: c.textMuted, fontSize: 13, marginBottom: 10 }}
                  >
                    accuracy
                  </Text>
                </View>

                <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>
                  {totalHit} of {totalPicked} bouts called ·{" "}
                  {totalPoints.toLocaleString()} pts
                </Text>

                <AnimatedBar percent={accuracy} style={{ marginTop: 14 }} />
              </FightCard>
            </Animated.View>

            <Text
              style={{
                color: c.textMuted,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.4,
                marginTop: 30,
                marginBottom: 4,
              }}
            >
              PAST EVENTS
            </Text>

            {PAST_EVENTS.map((e, i) => {
              const isOpen = !!open[e.id];
              const pct = e.total > 0 ? Math.round((e.hit / e.total) * 100) : 0;

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
                      borderBottomWidth: isOpen ? 0 : 1,
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
                        {e.date} · {e.hit} of {e.total} called
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
                        {e.points}
                      </Text>
                      <Text
                        style={{
                          color: pct >= 60 ? c.green : c.textMuted,
                          fontSize: 11,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {pct}%
                      </Text>
                    </View>

                    <Chevron open={isOpen} />
                  </PressableScale>

                  {isOpen && (
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
                          meta="Final"
                          detail={b.detail}
                          points={b.points}
                          verdict={b.verdict}
                          verdictNote={b.verdictNote}
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
