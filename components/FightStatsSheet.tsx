import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useFightStats } from "../hooks/useFightStats";
import type { BoutLine } from "../services/eventDetail";
import { divisionLabel } from "../services/events";
import { heroFor, statRows, statusLabel, type BoutStats, type StatRow } from "../services/fightStats";
import FightCard from "./FightCard";
import LiveDot from "./LiveDot";
import PressableScale from "./PressableScale";
import Skeleton from "./Skeleton";

/*
 * One fight's numbers, tale of the tape: both fighters side by side with sig.
 * strikes landed as the headline, then strikes, knockdowns, takedowns,
 * control and accuracy, for the whole fight or one round. Refreshes while
 * the fight is on and until the numbers are official. Open it by passing a
 * bout; null closes it.
 */
export default function FightStatsSheet({ bout, onClose }: { bout: BoutLine | null; onClose: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useFightStats(bout?.id ?? null, bout?.state === "live");
  const [round, setRound] = useState<number | null>(null);

  useEffect(() => setRound(null), [bout?.id]);

  const stats = state.status === "ready" ? state.stats : null;
  // A round that drops out of the numbers (a correction) falls back to All.
  const shown = stats && round != null && !stats.rounds.some((r) => r.round === round) ? null : round;

  return (
    <Modal visible={!!bout} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Tapping above the sheet closes it. */}
        <Pressable
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.overlay }}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          style={{
            maxHeight: "88%",
            backgroundColor: c.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.border,
            paddingTop: 10,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 10 }} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            {bout && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
                    {divisionLabel(bout.weightClass) || "FIGHT STATS"}
                  </Text>
                  <StatusChip stats={stats} live={bout.state === "live"} />
                </View>

                <FightCard label="SIG. STRIKES LANDED" labelColor={c.textMuted}>
                  <Hero bout={bout} stats={stats} round={shown} loading={state.status === "loading"} />
                </FightCard>

                {bout.pick && (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: c.surface2,
                    }}
                  >
                    <Ionicons name="locate" size={12} color={c.text2} />
                    <Text style={{ color: c.text2, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 }}>
                      YOUR PICK · {bout.pick.toUpperCase()}
                    </Text>
                  </View>
                )}

                {state.status === "loading" ? (
                  <View style={{ gap: 12 }}>
                    <Skeleton height={34} width={180} radius={17} />
                    <Skeleton height={44} radius={8} />
                    <Skeleton height={44} radius={8} />
                    <Skeleton height={44} radius={8} />
                  </View>
                ) : state.status === "error" ? (
                  <Text style={{ color: c.textMuted, fontSize: 14 }}>{"Couldn't load the stats. Try again in a moment."}</Text>
                ) : !stats ? (
                  <Text style={{ color: c.textMuted, fontSize: 14 }}>
                    {bout.state === "live" ? "Stats start when the fight does." : "No stats for this fight yet."}
                  </Text>
                ) : (
                  <>
                    {stats.rounds.length > 0 && <RoundTabs stats={stats} round={shown} onPick={setRound} />}
                    <View>
                      {statRows(stats, shown).map((row) => (
                        <Row key={row.label} row={row} />
                      ))}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: c.textMuted, fontSize: 11.5 }}>
                        {stats.official ? "Official" : "Unofficial · updates as the fight goes"}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 11.5 }}>Source: UFC stats</Text>
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StatusChip({ stats, live }: { stats: BoutStats | null; live: boolean }) {
  const { c } = useTheme();
  const label = stats ? statusLabel(stats) : live ? "LIVE" : null;
  if (!label) return null;
  const isLive = label.startsWith("LIVE");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: isLive ? c.redTint : c.surface2,
      }}
    >
      {isLive && <LiveDot />}
      <Text style={{ color: isLive ? c.red : c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

/** Red's share of a bar, with a 3px gap between the two halves. */
function Bar({ redShare, height, faded }: { redShare: number; height: number; faded?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", height, gap: 3, opacity: faded ? 0.3 : 1 }}>
      <View style={{ flex: redShare, backgroundColor: c.red, borderRadius: height / 2 }} />
      <View style={{ flex: 1 - redShare, backgroundColor: c.blue, borderRadius: height / 2 }} />
    </View>
  );
}

function HeroSide({ fighter, corner, value, loading }: { fighter: BoutLine["red"]; corner: "red" | "blue"; value: number | null; loading: boolean }) {
  const { c } = useTheme();
  const right = corner === "blue";
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6, alignItems: right ? "flex-end" : "flex-start" }}>
      <View style={{ flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            borderWidth: 2,
            borderColor: right ? c.blue : c.red,
            backgroundColor: c.input,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: c.textMuted, fontSize: 10, fontWeight: "800" }}>{fighter.initials}</Text>
        </View>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
          {fighter.name}
        </Text>
      </View>
      {loading ? (
        <Skeleton height={48} width={64} />
      ) : (
        <Text style={{ color: c.text, fontSize: 52, fontWeight: "800", letterSpacing: -1.5, fontVariant: ["tabular-nums"] }}>
          {value ?? "–"}
        </Text>
      )}
    </View>
  );
}

function Hero({ bout, stats, round, loading }: { bout: BoutLine; stats: BoutStats | null; round: number | null; loading: boolean }) {
  const hero = stats ? heroFor(stats, round) : null;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <HeroSide fighter={bout.red} corner="red" value={hero?.red ?? null} loading={loading} />
        <HeroSide fighter={bout.blue} corner="blue" value={hero?.blue ?? null} loading={loading} />
      </View>
      <Bar redShare={hero?.redShare ?? 0.5} height={8} faded={!hero || hero.red + hero.blue === 0} />
    </View>
  );
}

function RoundTabs({ stats, round, onPick }: { stats: BoutStats; round: number | null; onPick: (r: number | null) => void }) {
  const { c } = useTheme();
  const tabs: { label: string; value: number | null }[] = [
    { label: "All", value: null },
    ...stats.rounds.map((r) => ({ label: `R${r.round}`, value: r.round })),
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="tablist">
      {tabs.map((t) => {
        const selected = t.value === round;
        return (
          <PressableScale
            key={t.label}
            onPress={() => onPick(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              minWidth: 56,
              height: 34,
              paddingHorizontal: 14,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: selected ? c.text : c.borderStrong,
              backgroundColor: selected ? c.text : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? c.bg : c.text2, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.4 }}>{t.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

function Row({ row }: { row: StatRow }) {
  const { c } = useTheme();
  const note = (text?: string) => (text ? <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "600" }}>{text}</Text> : null);
  return (
    <View style={{ gap: 7, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {row.red} {note(row.redNote)}
        </Text>
        <Text style={{ color: c.text2, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>{row.label.toUpperCase()}</Text>
        <Text style={{ flex: 1, textAlign: "right", color: c.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {note(row.blueNote)} {row.blue}
        </Text>
      </View>
      <Bar redShare={row.redShare} height={4} faded={row.empty} />
    </View>
  );
}
