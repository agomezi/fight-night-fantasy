import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, {
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";
import PressableScale from "../components/PressableScale";
import { appear, popIn } from "../constants/motion";
import { useToggleProgress } from "../hooks/useToggleProgress";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import CardMark from "../components/CardMark";
import EmptyState from "../components/EmptyState";
import FighterPhoto from "../components/FighterPhoto";
import HeaderBar from "../components/HeaderBar";
import InfoCards from "../components/InfoCards";
import { StatBox, StatBoxRow } from "../components/StatBox";
import ProgressRing from "../components/ProgressRing";
import Skeleton from "../components/Skeleton";
import SwipeableCards, { Card as CarouselCard } from "../components/SwipeableCards";
import { DEMO, LEAGUE, SEASON_STANDINGS } from "../constants/league";
import { useNextEvent } from "../hooks/useNextEvent";
import { countdown, initials, lastName, lockLabel, splitEventName, startLabel } from "../services/events";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";

/** Tab label whose colour eases; the underline is drawn by the parent. */
function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const progress = useToggleProgress(active);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [c.textFaint, c.text]),
  }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      style={{ flex: 1, paddingBottom: 12, alignItems: "center" }}
    >
      <Animated.Text
        style={[
          { fontSize: 13, fontWeight: "700", letterSpacing: 1 },
          textStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

/** Fighter tile for Quick Pick — swells and warms when chosen. */
function FighterChoice({
  initials,
  name,
  record,
  photoUrl,
  selected,
  onPress,
}: {
  initials: string;
  name: string;
  record: string;
  photoUrl?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const progress = useToggleProgress(selected);

  const ringStyle = useAnimatedStyle(() => ({
    borderWidth: 1 + progress.value,
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.borderStrong, c.red],
    ),
    transform: [{ scale: 1 + progress.value * 0.08 }],
  }));

  const nameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [c.text, c.red]),
  }));

  return (
    <PressableScale
      onPress={onPress}
      style={{ alignItems: "center", flex: 1 }}
      scaleTo={0.94}
    >
      <Animated.View
        style={[
          {
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: c.input,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          },
          ringStyle,
        ]}
      >
        <FighterPhoto
          uri={photoUrl}
          initials={initials}
          radius={26}
          textStyle={{ color: c.text, fontWeight: "700" }}
        />

        {selected && (
          <Animated.View
            entering={popIn}
            exiting={ZoomOut.duration(120)}
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: c.red,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </Animated.View>
        )}
      </Animated.View>

      <Animated.Text
        style={[commonStyles.cardTitle, { fontSize: 16, marginBottom: 2 }, nameStyle]}
      >
        {name}
      </Animated.Text>
      <Text style={[commonStyles.cardSubtitle, { marginBottom: 0, fontSize: 12 }]}>
        {record}
      </Text>
    </PressableScale>
  );
}

/** Yes/No poll button that fills red as it's chosen. */
function VoteButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const progress = useToggleProgress(selected);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [c.card, c.red]),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.borderStrong, c.red],
    ),
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [c.text, "#FFFFFF"]),
  }));

  return (
    <PressableScale
      onPress={onPress}
      haptic="medium"
      style={[
        {
          flex: 1,
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: "center",
          borderWidth: 1,
        },
        boxStyle,
      ]}
    >
      <Animated.Text
        style={[
          { fontSize: 16, fontWeight: "700", letterSpacing: 2 },
          textStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [hotTakeVote, setHotTakeVote] = useState<"yes" | "no" | null>(null);
  const [picksTab, setPicksTab] = useState<"quick" | "full">("quick");
  // The fighter id chosen in Quick Pick.
  const [quickPick, setQuickPick] = useState<string | null>(null);

  const next = useNextEvent();
  const event = next.status === "ready" ? next.event : null;
  const eventName = event ? splitEventName(event.name) : null;
  const mainEvent = event?.bouts[0] ?? null;
  const toStart = event ? countdown(event.startsAt, next.now) : null;
  const locksIn = event ? lockLabel(event.locksAt, next.now) : "—";
  const weekday = event
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(event.startsAt)
    : "the card";
  const pad = (n: number) => String(n).padStart(2, "0");

  // Measured so the sliding underline matches whatever the tabs actually are.
  const [tabStripWidth, setTabStripWidth] = useState(0);
  const tabProgress = useToggleProgress(picksTab === "full");
  const underlineStyle = useAnimatedStyle(() => {
    const half = tabStripWidth / 2;
    return {
      width: half,
      transform: [{ translateX: tabProgress.value * half }],
    };
  });

  // --- carousel -----------------------------------------------------------
  // Two always-on cards, then two that only appear when they're relevant.
  const myStanding = SEASON_STANDINGS.find((s) => s.isMe);
  // A brand-new account has touched nothing, so this is 0 and the carousel
  // shows the "start your card" prompt instead of a progress ring.
  const picksStarted = DEMO ? 3 : 0;
  const picksTotal = event?.bouts.length ?? 0;
  const eventIsLive = event?.status === "live";
  // Until scoring exists this comes from the demo standings, or is simply zero.
  const lastEventPoints = myStanding ? 218 : 0;
  // The player directly above and directly below you.
  const neighbours = myStanding
    ? SEASON_STANDINGS.filter(
        (s) => s.rank === myStanding.rank - 1 || s.rank === myStanding.rank + 1,
      )
    : [];

  const carouselCards: CarouselCard[] = [
    {
      tag: "NEXT EVENT",
      tagColor: c.red,
      serial: event ? startLabel(event.startsAt) : undefined,
      // Content sits low in the card rather than crowding the header rule —
      // the event name is what you should land on, not the label above it.
      content: next.status === "loading" ? (
        // Same footprint as the loaded card: title, headline, countdown.
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 20, gap: 10 }}>
          <Skeleton width="55%" height={34} radius={8} />
          <Skeleton width="40%" height={12} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={52} radius={10} style={{ flex: 1 }} />
            ))}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 20 }}>
          <Text style={[commonStyles.cardTitle, { textAlign: "left", fontSize: 34 }]}>
            {eventName?.title ?? (next.status === "error" ? "Card unavailable" : "No card yet")}
          </Text>
          <Text style={[commonStyles.cardSubtitle, { textAlign: "left" }]}>
            {eventName?.headline?.toUpperCase() ??
              (next.status === "ready" && !event ? "The next card appears here once it's announced" : " ")}
          </Text>
          {toStart && (
            <StatBoxRow inline>
              <StatBox value={pad(toStart.days)} label="DAYS" />
              <StatBox value={pad(toStart.hours)} label="HOURS" />
              <StatBox value={pad(toStart.minutes)} label="MINS" />
            </StatBoxRow>
          )}
        </View>
      ),
    },
  ];

  if (LEAGUE && myStanding) {
    carouselCards.push({
      tag: "YOUR LEAGUE",
      tagColor: "#E8A020",

      serial: LEAGUE ? `WEEK ${LEAGUE.week}` : undefined,
      content: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <ProgressRing
            value={LEAGUE.members - myStanding.rank + 1}
            total={LEAGUE.members}
            center={ordinal(myStanding.rank)}
            caption={`of ${LEAGUE.members}`}
            size={116}
            color="#E8A020"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 19, fontWeight: "800" }}>
              {LEAGUE.name}
            </Text>
            <Text
              style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}
            >
              {myStanding.points.toLocaleString()} pts · week {LEAGUE.week}
            </Text>
            <Text
              style={{ color: c.green, fontSize: 12.5, fontWeight: "700", marginTop: 6 }}
            >
              {myStanding.move > 0
                ? `Up ${myStanding.move} this week`
                : myStanding.move < 0
                  ? `Down ${Math.abs(myStanding.move)} this week`
                  : "Holding position"}
            </Text>
          </View>
        </View>
      ),
    });
  }

  /*
   * Nothing picked yet. This is the single most important card on a new
   * account's home screen, so it gets a place in the carousel rather than
   * being left to the nav bar to suggest.
   */
  if (event && picksStarted === 0) {
    carouselCards.push({
      tag: "GET STARTED",
      tagColor: c.red,
      serial: `LOCKS ${locksIn}`,
      content: (
        <View style={{ flex: 1, justifyContent: "flex-end", gap: 12 }}>
          <View>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: "800" }}>
              Make your first picks
            </Text>
            <Text
              style={{ color: c.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 }}
            >
              {picksTotal} bouts on the card. Call the winner, the method and
              the round — the closer you get, the more it scores.
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push("/picks")}
            style={{
              backgroundColor: c.red,
              borderRadius: 10,
              paddingVertical: 12,
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
              START YOUR CARD
            </Text>
          </PressableScale>
        </View>
      ),
    });
  }

  // Only if they started a card and walked away without submitting.
  if (event && picksStarted > 0 && picksStarted < picksTotal) {
    carouselCards.push({
      tag: "UNFINISHED CARD",
      tagColor: c.red,
      serial: `LOCKS ${locksIn}`,
      content: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <ProgressRing
            value={picksStarted}
            total={picksTotal}
            center={`${picksStarted}`}
            caption={`of ${picksTotal}`}
            size={116}
          />
          <View style={{ flex: 1, gap: 10 }}>
            <View>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>
                Still open
              </Text>
              <Text
                style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 }}
              >
                {picksTotal - picksStarted} bouts left · locks in {locksIn.toLowerCase()}
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
                FINISH YOUR CARD
              </Text>
            </PressableScale>
          </View>
        </View>
      ),
    });
  }

  // Only while a card is actually being fought.
  if (eventIsLive) {
    carouselCards.push({
      tag: "LIVE",
      tagColor: c.red,
      serial: "IN PROGRESS",
      content: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <ProgressRing value={4} total={7} center="4" caption="of 7" size={116} color={c.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>
              Running accuracy
            </Text>
            <Text
              style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}
            >
              4 of 7 scored bouts called · 5 to go
            </Text>
          </View>
        </View>
      ),
    });
  }

  const fullCardFights = (event?.bouts ?? []).slice(0, 3).map((bout) => ({
    id: bout.id,
    matchup: `${lastName(bout.red.name)} vs ${lastName(bout.blue.name)}`,
    division: bout.order === 1 ? "MAIN EVENT" : (bout.weightClass ?? ""),
  }));
  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 24, paddingBottom: 24 }}
      >
        <HeaderBar />

        {/*
          Cards earn their place — each one only appears when it has something
          to say. A card that reads "no league" or "0 picked" is noise, so it
          simply isn't there.
        */}
        <SwipeableCards minHeight={252} cards={carouselCards} />
        <View
          style={[
            commonStyles.cardWrapper,
            { marginBottom: 9, justifyContent: "space-between" },
          ]}
        >
          <Text
            style={[
              commonStyles.cardTitle,
              { textAlign: "left", paddingLeft: 3 },
            ]}
          >
            Your Performance
          </Text>
          <PressableScale onPress={() => router.push("/history")} hitSlop={10}>
            <Text
              style={[commonStyles.cardSubtitle, { marginTop: 9, paddingRight: 3 }]}
            >
              View History
            </Text>
          </PressableScale>
        </View>
        <InfoCards
          cards={[
            {
              /*
               * Empty here is not "rank: —". A stat card with nothing in it is
               * dead space, so when there's no league the card stops being a
               * stat and becomes the thing that would fill it.
               */
              ...(myStanding && LEAGUE
                ? {
                    serial: LEAGUE.name.toUpperCase(),
                    mark: <CardMark name="trophy" color={c.gold} opacity={1} />,
                    tag: "CURRENT LEAGUE RANK",
                    tagColor: c.textMuted,
                    title: ordinal(myStanding.rank),
                    titleSize: 50,
                    footer: (
                      <>
                        <Text
                          style={[
                            commonStyles.cardSubtitle,
                            { textAlign: "left", marginBottom: 12 },
                          ]}
                        >
                          {myStanding.team} · {LEAGUE.members} in the league
                        </Text>
                        {/* Who you're chasing and who's chasing you — worth
                            more than restating the rank in ghost type. */}
                        {neighbours.map((n) => (
                          <View
                            key={n.id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                              paddingVertical: 8,
                              borderTopWidth: 1,
                              borderTopColor: c.border,
                            }}
                          >
                            <Text
                              style={{
                                color: n.rank < myStanding.rank ? c.green : c.textFaint,
                                fontSize: 12,
                                fontWeight: "800",
                                width: 12,
                              }}
                            >
                              {n.rank < myStanding.rank ? "↑" : "↓"}
                            </Text>
                            <Text
                              style={{ flex: 1, color: c.text2, fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {n.name}
                            </Text>
                            <Text
                              style={{
                                color: c.textMuted,
                                fontSize: 12.5,
                                fontWeight: "700",
                                fontVariant: ["tabular-nums"],
                              }}
                            >
                              {n.points > myStanding.points ? "+" : ""}
                              {Math.round(n.points - myStanding.points)}
                            </Text>
                          </View>
                        ))}
                      </>
                    ),
                  }
                : {
                    serial: "NO LEAGUE",
                    // No mark on the empty card. A mark is sized to sit beside
                    // a short numeral; the prompt runs to prose and a button,
                    // and the two collide.
                    tag: "LEAGUES",
                    tagColor: "#E8A020",
                    title: "Find your people",
                    titleSize: 32,
                    footer: (
                      <>
                        <Text
                          style={[
                            commonStyles.cardSubtitle,
                            { textAlign: "left", marginBottom: 14 },
                          ]}
                        >
                          Rank, records and weekly matchups all start once
                          you&apos;re in a league.
                        </Text>
                        <PressableScale
                          onPress={() => router.push("/leagues")}
                          style={{
                            backgroundColor: c.red,
                            borderRadius: 10,
                            paddingVertical: 12,
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
                            CREATE OR JOIN
                          </Text>
                        </PressableScale>
                      </>
                    ),
                  }),
            },
            {
              /*
               * Same rule: zero points is not a stat worth a tile. Before the
               * first event this card looks forward instead of back.
               */
              ...(lastEventPoints > 0
                ? {
                    serial: "UFC 299",
                    mark: <CardMark name="belt" top={44} color={c.textFaint} accent={c.gold} opacity={1} />,
                    tag: "LAST EVENT POINTS",
                    tagColor: c.textMuted,
                    title: String(lastEventPoints),
                    titleUnit: "PTS",
                    titleSize: 50,
                    footer: (
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginTop: 12,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: c.border,
                        }}
                      >
                        <Text
                          style={[commonStyles.cardSubtitle, { textAlign: "left", marginBottom: 0 }]}
                        >
                          Avg. score
                        </Text>
                        <Text
                          style={[commonStyles.cardSubtitle, { textAlign: "right", marginBottom: 0 }]}
                        >
                          197
                        </Text>
                      </View>
                    ),
                  }
                : {
                    serial: toStart
                      ? toStart.days > 1
                        ? `IN ${toStart.days} DAYS`
                        : toStart.days === 1
                          ? "TOMORROW"
                          : "TODAY"
                      : undefined,
                    // Same reason as the league card above — no room for it
                    // once the card carries a sentence instead of a score.
                    tag: "YOUR FIRST EVENT",
                    tagColor: c.red,
                    title: eventName?.title ?? "Coming soon",
                    titleSize: 40,
                    footer: (
                      <Text
                        style={[commonStyles.cardSubtitle, { textAlign: "left" }]}
                      >
                        {eventName?.headline
                          ? `${eventName.headline}. Get a card in before ${weekday} and this becomes your score.`
                          : "Get a card in before the next event and this becomes your score."}
                      </Text>
                    ),
                  }),
            },
            {
              tag: "Last Event Recap",
              tagColor: c.text,
              tagSize: 22,
              footer: (
                <EmptyState
                  icon="time-outline"
                  title="No history yet"
                  message="Once you play an event, your pick-by-pick results land here."
                />
              ),
            },
          ]}
        />
        <View
          style={[
            commonStyles.cardWrapper,
            { marginBottom: 9, justifyContent: "space-between" },
          ]}
        >
          <Text
            style={[
              commonStyles.cardTitle,
              { textAlign: "left", paddingLeft: 3 },
            ]}
          >
            Actions
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: c.red,
              }}
            />
            <Text style={[commonStyles.cardSubtitle, { marginBottom: 0 }]}>
              {locksIn === "LOCKED" ? "Locked" : `Locks in ${locksIn.toLowerCase()}`}
            </Text>
          </View>
        </View>

        <Animated.View entering={appear(0)} style={commonStyles.homeCard}>
          <View
            onLayout={(e) =>
              setTabStripWidth(Math.max(0, e.nativeEvent.layout.width - 48))
            }
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              marginBottom: 16,
              marginHorizontal: -24,
              paddingHorizontal: 24,
            }}
          >
            {(["quick", "full"] as const).map((tab) => {
              const label = tab === "quick" ? "QUICK PICK" : `FULL CARD (${picksTotal})`;
              return (
                <TabButton
                  key={tab}
                  label={label}
                  active={picksTab === tab}
                  onPress={() => setPicksTab(tab)}
                />
              );
            })}

            {/* Single underline that slides between tabs, rather than one
                border blinking off and another blinking on. */}
            <Animated.View
              style={[
                {
                  position: "absolute",
                  bottom: -1,
                  left: 24,
                  height: 2,
                  backgroundColor: c.red,
                },
                underlineStyle,
              ]}
            />
          </View>

          {next.status === "loading" ? (
            <View style={{ gap: 16 }}>
              <Skeleton width="60%" height={11} />
              <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
                {[0, 1].map((i) => (
                  <View key={i} style={{ alignItems: "center", gap: 8 }}>
                    <Skeleton width={52} height={52} radius={12} />
                    <Skeleton width={70} height={11} />
                  </View>
                ))}
              </View>
              <Skeleton height={46} radius={10} />
            </View>
          ) : picksTab === "quick" && !mainEvent ? (
            <EmptyState
              icon="calendar-outline"
              title="No card yet"
              message="Picks open as soon as the next card is announced."
            />
          ) : picksTab === "quick" && mainEvent ? (
            <View>
              <Text
                style={[
                  commonStyles.label,
                  { color: c.textFaint, marginBottom: 20 },
                ]}
              >
                {eventName?.title} · MAIN EVENT —{" "}
                <Text style={{ color: c.red }}>{mainEvent.weightClass?.toUpperCase()}</Text>
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <FighterChoice
                  initials={initials(mainEvent.red.name)}
                  name={lastName(mainEvent.red.name).toUpperCase()}
                  record={mainEvent.red.nickname ?? `${mainEvent.scheduledRounds} RDS`}
                  photoUrl={mainEvent.red.photoUrl}
                  selected={quickPick === mainEvent.red.id}
                  onPress={() => setQuickPick(mainEvent.red.id)}
                />
                <Text style={{ color: c.textFaint, fontWeight: "700", fontSize: 13 }}>
                  VS
                </Text>
                <FighterChoice
                  initials={initials(mainEvent.blue.name)}
                  name={lastName(mainEvent.blue.name).toUpperCase()}
                  record={mainEvent.blue.nickname ?? `${mainEvent.scheduledRounds} RDS`}
                  photoUrl={mainEvent.blue.photoUrl}
                  selected={quickPick === mainEvent.blue.id}
                  onPress={() => setQuickPick(mainEvent.blue.id)}
                />
              </View>

              <PressableScale
                disabled={!quickPick}
                onPress={() =>
                  router.push({
                    pathname: "/picks",
                    params: { fighter: quickPick as string },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor: quickPick ? c.red : c.borderStrong,
                  backgroundColor: quickPick ? c.red : "transparent",
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: quickPick ? "#fff" : c.textFaint,
                    fontWeight: "700",
                    fontSize: 13,
                    letterSpacing: 2,
                  }}
                >
                  {quickPick ? "LOCK IN YOUR PICKS →" : "SELECT A FIGHTER TO PICK"}
                </Text>
              </PressableScale>
            </View>
          ) : (
            <View style={{ gap: 0 }}>
              {fullCardFights.map((fight, i) => (
                <View
                  key={fight.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    borderBottomWidth: i < fullCardFights.length - 1 ? 1 : 0,
                    borderBottomColor: c.border,
                  }}
                >
                  <View>
                    <Text
                      style={[
                        commonStyles.cardTitle,
                        { fontSize: 15, textAlign: "left", marginBottom: 2 },
                      ]}
                    >
                      {fight.matchup}
                    </Text>
                    <Text
                      style={[
                        commonStyles.label,
                        { color: c.red, marginBottom: 0 },
                      ]}
                    >
                      {fight.division}
                    </Text>
                  </View>
                  <PressableScale
                    onPress={() => router.push("/picks")}
                    style={{
                      backgroundColor: c.red,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 12,
                        letterSpacing: 1,
                      }}
                    >
                      PICK
                    </Text>
                  </PressableScale>
                </View>
              ))}
              <PressableScale
                onPress={() => router.push("/picks")}
                style={{ marginTop: 8, alignItems: "center" }}
              >
                <Text style={[commonStyles.cardSubtitle, { marginBottom: 0 }]}>
                  {picksTotal > fullCardFights.length
                    ? `+ ${picksTotal - fullCardFights.length} more fights →`
                    : "Open your card →"}
                </Text>
              </PressableScale>
            </View>
          )}
        </Animated.View>

        <View
          style={[
            commonStyles.cardWrapper,
            { marginBottom: 9, justifyContent: "flex-start" },
          ]}
        >
          <Text
            style={[
              commonStyles.cardTitle,
              { textAlign: "left", paddingLeft: 3 },
            ]}
          >
            Community
          </Text>
        </View>
        <InfoCards
          cards={[
            {
              tag: "TODAY'S CALL",
              tagColor: c.red,
              title: mainEvent
                ? `Does ${lastName(mainEvent.red.name)} finish ${lastName(mainEvent.blue.name)} inside 2 rounds?`.toUpperCase()
                : "NEXT CARD'S CALL DROPS SOON",
              subtitle: mainEvent ? `${eventName?.title} main event · ${weekday}` : "Check back once the card is announced",
              footer: (
                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  {(["yes", "no"] as const).map((option) => (
                    <VoteButton
                      key={option}
                      label={option.toUpperCase()}
                      selected={hotTakeVote === option}
                      onPress={() => setHotTakeVote(option)}
                    />
                  ))}
                </View>
              ),
            },
            {
              tag: "FIGHTER SPOTLIGHT",
              tagColor: c.textMuted,
              footer: (
                <View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: c.input,
                        borderWidth: 1,
                        borderColor: c.borderStrong,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: c.text,
                        }}
                      >
                        AP
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          commonStyles.cardTitle,
                          { textAlign: "left", fontSize: 20, marginBottom: 2 },
                        ]}
                      >
                        ALEX PEREIRA
                      </Text>
                      <Text
                        style={[
                          commonStyles.cardSubtitle,
                          { textAlign: "left", marginBottom: 0 },
                        ]}
                      >
                        Light Heavyweight · 29-3
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      color: c.text2,
                      marginBottom: 16,
                      lineHeight: 18,
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>
                      Finishes 80% of his wins.
                    </Text>{" "}
                    9 of his last 12 victories ended by knockout — he rarely
                    leaves it to the judges.
                  </Text>
                  <StatBoxRow inline>
                    <StatBox value="80%" label="FINISH RATE" accent />
                    <StatBox value="4" label="WIN STREAK" />
                    <StatBox value='79"' label="REACH" />
                  </StatBoxRow>
                </View>
              ),
            },
          ]}
        />
      </ScrollView>

      <View
        style={{
          backgroundColor: c.navBar,
          borderTopColor: c.border,
          borderTopWidth: 1,
          paddingBottom: insets.bottom,
        }}
      >
        <BottomNav active="home" />
      </View>
    </SafeAreaView>
  );
}
