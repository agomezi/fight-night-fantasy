import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import BottomNav from "../components/BottomNav";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import PressableScale from "../components/PressableScale";
import ProgressRing from "../components/ProgressRing";
import ResultRow from "../components/ResultRow";
import SwipeableCards from "../components/SwipeableCards";
import {
  EVENT_ACCURACY,
  LEAGUE,
  RECENT_RESULTS,
  SUPERLATIVE,
} from "../constants/league";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";

/* -------------------------------------------------------------------------
 * The event card. Real's list treatment: no box, hairline between rows, and
 * the fight is the headline with its division underneath.
 * ---------------------------------------------------------------------- */

type Bout = {
  id: string;
  a: { initials: string; name: string };
  b: { initials: string; name: string };
  division: string;
  rounds: 3 | 5;
  billing: string;
};

const CARD: Bout[] = [
  {
    id: "main",
    a: { initials: "AP", name: "Pereira" },
    b: { initials: "JH", name: "Hill" },
    division: "Light Heavyweight",
    rounds: 5,
    billing: "MAIN EVENT",
  },
  {
    id: "zhang-yan",
    a: { initials: "ZW", name: "Zhang" },
    b: { initials: "XY", name: "Yan" },
    division: "Strawweight",
    rounds: 3,
    billing: "CO-MAIN",
  },
  {
    id: "gaethje-holloway",
    a: { initials: "JG", name: "Gaethje" },
    b: { initials: "MH", name: "Holloway" },
    division: "Lightweight",
    rounds: 3,
    billing: "MAIN CARD",
  },
  {
    id: "oliveira-tsarukyan",
    a: { initials: "CO", name: "Oliveira" },
    b: { initials: "AT", name: "Tsarukyan" },
    division: "Lightweight",
    rounds: 3,
    billing: "MAIN CARD",
  },
];

const EVENTS = ["UFC 300", "UFC 301", "Fight Night"];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [event, setEvent] = useState(EVENTS[0]);

  // Nothing is picked on a new account; the ring is the reminder of that.
  const picked = 0;
  const total = CARD.length + 8;

  const sectionLabel = {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1.4,
  };

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
      >
        <View style={commonStyles.row}>
          <ProfileBadge />
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <NotificationBell hasNotifications />
        </View>
        <View style={commonStyles.divider} />

        {/*
          Carousel leads, and the picks ring is card one — so someone who
          started picking, left, and came back is reminded where they stopped
          before anything else on the screen.
        */}
        <SwipeableCards
          minHeight={186}
          cards={[
            {
              tag: "YOUR CARD",
              tagColor: c.red,
              content: (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                  <ProgressRing
                    value={picked}
                    total={total}
                    center={`${picked}`}
                    caption={`of ${total}`}
                    size={124}
                  />
                  <View style={{ flex: 1, gap: 10 }}>
                    <View>
                      <Text style={{ color: c.text, fontSize: 17, fontWeight: "800" }}>
                        {picked === 0 ? "Nothing picked yet" : "Pick up where you left off"}
                      </Text>
                      <Text
                        style={{
                          color: c.textMuted,
                          fontSize: 12.5,
                          lineHeight: 18,
                          marginTop: 3,
                        }}
                      >
                        {total - picked} bouts open · locks in 14h
                      </Text>
                    </View>
                    <PressableScale
                      onPress={() => router.push("/picks")}
                      style={{
                        backgroundColor: c.red,
                        borderRadius: 10,
                        paddingVertical: 11,
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
                        {picked === 0 ? "START PICKING" : "CONTINUE"}
                      </Text>
                    </PressableScale>
                  </View>
                </View>
              ),
            },
            {
              tag: "YOUR STYLE",
              tagColor: "#E8A020",
              content: (
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: "BebasNeue",
                      fontSize: 38,
                      color: c.text,
                      letterSpacing: 1,
                    }}
                  >
                    {SUPERLATIVE ? SUPERLATIVE.title.toUpperCase() : "NO READ YET"}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19 }}>
                    {SUPERLATIVE
                      ? SUPERLATIVE.blurb
                      : "Play an event and we'll work out what kind of picker you are."}
                  </Text>
                </View>
              ),
            },
            {
              tag: "THIS EVENT",
              tagColor: c.textMuted,
              content: (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                  <ProgressRing
                    value={EVENT_ACCURACY?.hit ?? 0}
                    total={EVENT_ACCURACY?.total ?? 1}
                    center={EVENT_ACCURACY ? `${EVENT_ACCURACY.hit}` : "—"}
                    caption="correct"
                    size={124}
                    color={c.green}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 17, fontWeight: "800" }}>
                      Accuracy
                    </Text>
                    <Text
                      style={{
                        color: c.textMuted,
                        fontSize: 12.5,
                        lineHeight: 18,
                        marginTop: 3,
                      }}
                    >
                      {EVENT_ACCURACY
                        ? `${EVENT_ACCURACY.hit} of ${EVENT_ACCURACY.total} bouts called`
                        : "Fills in live as bouts are scored."}
                    </Text>
                  </View>
                </View>
              ),
            },
          ]}
        />

        {/* Event strip — which card you're looking at. */}
        <View style={{ marginTop: 28 }}>
          <Text style={sectionLabel}>EVENTS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
          >
            {EVENTS.map((e) => {
              const on = e === event;
              return (
                <PressableScale
                  key={e}
                  onPress={() => setEvent(e)}
                  scaleTo={0.95}
                  style={{
                    paddingHorizontal: 15,
                    paddingVertical: 9,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? c.red : c.borderStrong,
                    backgroundColor: on ? c.redTint : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: on ? c.red : c.textMuted,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {e}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        {/* The card itself — no boxes, hairlines between bouts. */}
        <View style={[commonStyles.row, { marginTop: 6, marginBottom: 4 }]}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: "800" }}>{event}</Text>
          <PressableScale onPress={() => router.push("/picks")} hitSlop={10}>
            <Text style={{ color: c.red, fontSize: 12.5, fontWeight: "700" }}>
              Pick all ›
            </Text>
          </PressableScale>
        </View>

        {CARD.map((b, i) => (
          <Animated.View key={b.id} entering={appear(i)}>
            <PressableScale
              onPress={() => router.push("/picks")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 15,
                borderBottomWidth: i === CARD.length - 1 ? 0 : 1,
                borderBottomColor: c.border,
              }}
            >
              <View style={{ flexDirection: "row" }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c.input,
                    borderWidth: 1.5,
                    borderColor: c.red,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: c.textMuted }}>
                    {b.a.initials}
                  </Text>
                </View>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: c.input,
                    borderWidth: 1.5,
                    borderColor: c.blue,
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: -10,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: c.textMuted }}>
                    {b.b.initials}
                  </Text>
                </View>
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>
                  {b.a.name} vs {b.b.name}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 11.5, marginTop: 2 }}>
                  {b.division} · {b.rounds} rounds
                </Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: b.billing === "MAIN EVENT" ? c.red : c.textFaint,
                    fontSize: 9.5,
                    fontWeight: "800",
                    letterSpacing: 0.8,
                  }}
                >
                  {b.billing}
                </Text>
                <Text style={{ color: c.textFaint, fontSize: 11, marginTop: 3 }}>
                  No pick
                </Text>
              </View>
            </PressableScale>
          </Animated.View>
        ))}

        {/* History — Real's row format, where method is the headline. */}
        <View style={[commonStyles.row, { marginTop: 30, marginBottom: 4 }]}>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: "800" }}>History</Text>
          {RECENT_RESULTS.length > 0 && (
            <Text style={{ color: c.textMuted, fontSize: 12.5, fontWeight: "700" }}>
              View all ›
            </Text>
          )}
        </View>

        {RECENT_RESULTS.length === 0 ? (
          <View style={{ paddingVertical: 22 }}>
            <Text style={{ color: c.text2, fontSize: 14, fontWeight: "700" }}>
              Nothing scored yet
            </Text>
            <Text style={{ color: c.textFaint, fontSize: 12.5, lineHeight: 19, marginTop: 4 }}>
              After fight night, every bout lands here with what you called next to
              what actually happened.
            </Text>
          </View>
        ) : (
          RECENT_RESULTS.map((r, i) => (
            <ResultRow
              key={r.id}
              index={i}
              red={r.red}
              blue={r.blue}
              meta="Final"
              detail={r.detail}
              points={r.points}
              verdict={r.verdict}
              verdictNote={r.verdictNote}
              last={i === RECENT_RESULTS.length - 1}
            />
          ))
        )}

        {!LEAGUE && (
          <PressableScale
            onPress={() => router.push("/leagues")}
            style={{
              marginTop: 26,
              paddingVertical: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: c.borderStrong,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: c.text2,
                fontSize: 11.5,
                fontWeight: "800",
                letterSpacing: 1.2,
              }}
            >
              CREATE A LEAGUE
            </Text>
          </PressableScale>
        )}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom, backgroundColor: c.navBar }}>
        <BottomNav active="home" />
      </View>
    </SafeAreaView>
  );
}
