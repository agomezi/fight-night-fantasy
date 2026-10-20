import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
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
import { useAuth } from "../context/AuthContext";
import { loadPinnedCalls, MAX_PINNED_CALLS, pinCall, unpinCall } from "../services/pins";
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
  const state = useHistory();
  const { session } = useAuth();
  const myId = session?.user.id;

  // Correct calls on final results can be pinned to your profile. One
  // change per call at a time, so the server can't end up out of order; on
  // a failure the list is read back rather than guessed.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const busy = useRef(new Set<string>());
  const reloadPins = useCallback(() => {
    if (!myId) return;
    loadPinnedCalls(myId)
      .then((v) => setPinned(new Set(v.map((p) => p.boutId))))
      .catch(() => {});
  }, [myId]);
  useEffect(reloadPins, [reloadPins]);
  const togglePin = useCallback(
    (boutId: string) => {
      if (busy.current.has(boutId)) return;
      const was = pinned.has(boutId);
      if (!was && pinned.size >= MAX_PINNED_CALLS) {
        Alert.alert("You've pinned 3 calls", "Unpin one first, here or from your profile.");
        return;
      }
      busy.current.add(boutId);
      setPinned((prev) => {
        const next = new Set(prev);
        if (was) next.delete(boutId);
        else next.add(boutId);
        return next;
      });
      (was ? unpinCall(boutId) : pinCall(boutId))
        .catch((e) => {
          Alert.alert(was ? "Couldn't unpin it" : "Couldn't pin it", e instanceof Error ? e.message : "Please try again.");
          reloadPins();
        })
        .finally(() => busy.current.delete(boutId));
    },
    [pinned, reloadPins]
  );
  const history = state.status === "ready" ? state.history : null;
  const past = history?.events ?? [];
  const season = history?.season;

  // Opened from a result notification: that bout's card opens, scrolled to
  // the fight, which is lit up for a moment.
  const { bout: focusBout } = useLocalSearchParams<{ bout?: string }>();
  const focusEvent = focusBout ? past.find((e) => e.bouts.some((b) => b.id === focusBout))?.id : undefined;
  const scrollRef = useRef<ScrollView>(null);
  const focusRef = useRef<View>(null);
  const scrolled = useRef(false);
  const [lit, setLit] = useState(true);
  useEffect(() => {
    if (!focusEvent) return;
    const t = setTimeout(() => setLit(false), 2500);
    return () => clearTimeout(t);
  }, [focusEvent]);
  const scrollToFocus = () => {
    const inner = scrollRef.current?.getInnerViewNode();
    if (scrolled.current || !inner || !focusRef.current) return;
    scrolled.current = true;
    focusRef.current.measureLayout(
      inner,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: true }),
      () => {}
    );
  };

  // Otherwise the most recent event opens — it's the one you came to check.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === (focusEvent ?? past[0]?.id);
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
        ref={scrollRef}
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

        {past.length === 0 ? (
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
                      {e.bouts.map((b, bi) => {
                        const focused = b.id === focusBout;
                        return (
                          <View
                            key={b.id}
                            ref={focused ? focusRef : undefined}
                            onLayout={focused ? scrollToFocus : undefined}
                            style={
                              focused && lit
                                ? { backgroundColor: c.redTint, borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8 }
                                : undefined
                            }
                          >
                            <ResultRow
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
                              pin={
                                b.verdict === "hit" && b.meta === "Final"
                                  ? { pinned: pinned.has(b.id), onPress: () => togglePin(b.id) }
                                  : undefined
                              }
                            />
                          </View>
                        );
                      })}
                      <PressableScale
                        onPress={() => router.push({ pathname: "/event/[id]", params: { id: e.id } })}
                        style={{ paddingTop: 12, alignItems: "center" }}
                      >
                        <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: "700" }}>See the full card →</Text>
                      </PressableScale>
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
