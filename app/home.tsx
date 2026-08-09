import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, {
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";
import AnimatedBar from "../components/AnimatedBar";
import PressableScale from "../components/PressableScale";
import { appear, popIn } from "../constants/motion";
import { useToggleProgress } from "../hooks/useToggleProgress";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import InfoCards from "../components/InfoCards";
import { StatBox, StatBoxRow } from "../components/StatBox";
import ProgressRing from "../components/ProgressRing";
import SwipeableCards, { Card as CarouselCard } from "../components/SwipeableCards";
import { LEAGUE, SEASON_STANDINGS } from "../constants/league";
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
  selected,
  onPress,
}: {
  initials: string;
  name: string;
  record: string;
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
        <Text style={{ color: c.text, fontWeight: "700" }}>{initials}</Text>

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
  const [quickPick, setQuickPick] = useState<"pereira" | "hill" | null>(null);

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
  const picksStarted = 3;
  const picksTotal = 12;
  const eventIsLive = false;

  const carouselCards: CarouselCard[] = [
    {
      tag: "NEXT EVENT",
      tagColor: c.red,
      watermark: "300",
      title: "UFC 300",
      subtitle: "PEREIRA VS HILL",
      footer: (
        <StatBoxRow inline>
          <StatBox value="02" label="DAYS" />
          <StatBox value="14" label="HOURS" />
          <StatBox value="45" label="MINS" />
        </StatBoxRow>
      ),
    },
  ];

  if (LEAGUE && myStanding) {
    carouselCards.push({
      tag: "YOUR LEAGUE",
      tagColor: "#E8A020",
      watermark: myStanding ? ordinal(myStanding.rank) : undefined,
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

  // Only if they started a card and walked away without submitting.
  if (picksStarted > 0 && picksStarted < picksTotal) {
    carouselCards.push({
      tag: "UNFINISHED CARD",
      tagColor: c.red,
      watermark: String(picksTotal - picksStarted),
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
                {picksTotal - picksStarted} bouts left · locks in 14h
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
      watermark: "LIVE",
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

  const fullCardFights = [
    { matchup: "Pereira vs Hill", division: "TITLE FIGHT" },
    { matchup: "Holloway vs Gaethje", division: "Lightweight" },
    { matchup: "Poatan vs Ankalaev", division: "Light HW" },
  ];
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ProfileBadge />
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <NotificationBell />
        </View>
        <View style={commonStyles.divider} />

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
          <Text
            style={[
              commonStyles.cardSubtitle,
              { marginTop: 9, paddingRight: 3 },
            ]}
          >
            View History
          </Text>
        </View>
        <InfoCards
          cards={[
            {
              watermark: "#4",
              tag: "CURRENT LEAGUE RANK",
              tagColor: c.textMuted,
              title: "—",
              titleSize: 50,
              footer: (
                <Text
                  style={[commonStyles.cardSubtitle, { textAlign: "left" }]}
                >
                  Unranked · join a league to get on the board
                </Text>
              ),
            },
            {
              watermark: "842",
              tag: "LAST EVENT POINTS",
              tagColor: c.textMuted,
              title: "0",
              titleUnit: "PTS",
              titleSize: 50,
              footer: (
                <>
                  <View
                    style={[
                      commonStyles.divider,
                      { marginTop: 6, marginBottom: 10 },
                    ]}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={[
                        commonStyles.cardSubtitle,
                        { textAlign: "left", marginBottom: 0 },
                      ]}
                    >
                      Avg. Score
                    </Text>
                    <Text
                      style={[
                        commonStyles.cardSubtitle,
                        {
                          textAlign: "right",
                          marginBottom: 0,
                        },
                      ]}
                    >
                      —
                    </Text>
                  </View>
                </>
              ),
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
              Locks in 14h
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
              const label = tab === "quick" ? "QUICK PICK" : "FULL CARD (12)";
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

          {picksTab === "quick" ? (
            <View>
              <Text
                style={[
                  commonStyles.label,
                  { color: c.textFaint, marginBottom: 20 },
                ]}
              >
                UFC 300 · MAIN EVENT —{" "}
                <Text style={{ color: c.red }}>LHW TITLE</Text>
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
                  initials="AP"
                  name="PEREIRA"
                  record="29-9 · C"
                  selected={quickPick === "pereira"}
                  onPress={() => setQuickPick("pereira")}
                />
                <Text style={{ color: c.textFaint, fontWeight: "700", fontSize: 13 }}>
                  VS
                </Text>
                <FighterChoice
                  initials="JH"
                  name="HILL"
                  record="12-1 · #1"
                  selected={quickPick === "hill"}
                  onPress={() => setQuickPick("hill")}
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <AnimatedBar percent={61} height={4} />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 6,
                  }}
                >
                  <Text style={[commonStyles.cardSubtitle, { marginBottom: 0, fontSize: 12 }]}>
                    61% picking Pereira
                  </Text>
                  <Text style={[commonStyles.cardSubtitle, { marginBottom: 0, fontSize: 12 }]}>
                    39% Hill
                  </Text>
                </View>
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
                  key={i}
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
                  + 9 more fights →
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
              title: "DOES PEREIRA FINISH HILL INSIDE 2 ROUNDS?",
              subtitle: "UFC 300 main event · Sat night",
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
