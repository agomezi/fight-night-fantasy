import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import PressableScale from "../components/PressableScale";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import InfoCards from "../components/InfoCards";
import { StatBox, StatBoxRow } from "../components/StatBox";
import SwipeableCards from "../components/SwipeableCards";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeCommonStyles } from "../styles/common";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [hotTakeVote, setHotTakeVote] = useState<"yes" | "no" | null>(null);
  const [picksTab, setPicksTab] = useState<"quick" | "full">("quick");
  const [quickPick, setQuickPick] = useState<"pereira" | "hill" | null>(null);

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

        <SwipeableCards
          cards={[
            {
              tag: "NEXT EVENT",
              tagColor: c.red,
              title: "UFC 300",
              subtitle: "PEREIRA VS HILL",
              aspectRatio: 1.2,
              footer: (
                <StatBoxRow>
                  <StatBox value="02" label="DAYS" />
                  <StatBox value="14" label="HOURS" />
                  <StatBox value="45" label="MINS" />
                </StatBoxRow>
              ),
            },
            {
              tag: "YOUR LEAGUE",
              tagColor: "#E8A020",
              title: "NO LEAGUE",
              subtitle: "Create or join one to start competing",
              aspectRatio: 1.2,
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

        <View style={commonStyles.homeCard}>
          <View
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
              const active = picksTab === tab;
              return (
                <PressableScale
                  key={tab}
                  onPress={() => setPicksTab(tab)}
                  style={{
                    flex: 1,
                    paddingBottom: 12,
                    alignItems: "center",
                    borderBottomWidth: 2,
                    borderBottomColor: active ? c.red : "transparent",
                    marginBottom: -1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      letterSpacing: 1,
                      color: active ? c.text : c.textFaint,
                    }}
                  >
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
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
                <PressableScale
                  onPress={() => setQuickPick("pereira")}
                  style={{ alignItems: "center", flex: 1 }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: c.input,
                      borderWidth: quickPick === "pereira" ? 2 : 1,
                      borderColor: quickPick === "pereira" ? c.red : c.borderStrong,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: c.text, fontWeight: "700" }}>AP</Text>
                  </View>
                  <Text
                    style={[
                      commonStyles.cardTitle,
                      { fontSize: 16, marginBottom: 2 },
                      quickPick === "pereira" && { color: c.red },
                    ]}
                  >
                    PEREIRA
                  </Text>
                  <Text style={[commonStyles.cardSubtitle, { marginBottom: 0, fontSize: 12 }]}>
                    29-9 · C
                  </Text>
                </PressableScale>
                <Text style={{ color: c.textFaint, fontWeight: "700", fontSize: 13 }}>
                  VS
                </Text>
                <PressableScale
                  onPress={() => setQuickPick("hill")}
                  style={{ alignItems: "center", flex: 1 }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: c.input,
                      borderWidth: quickPick === "hill" ? 2 : 1,
                      borderColor: quickPick === "hill" ? c.red : c.borderStrong,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: c.text, fontWeight: "700" }}>JH</Text>
                  </View>
                  <Text
                    style={[
                      commonStyles.cardTitle,
                      { fontSize: 16, marginBottom: 2 },
                      quickPick === "hill" && { color: c.red },
                    ]}
                  >
                    HILL
                  </Text>
                  <Text style={[commonStyles.cardSubtitle, { marginBottom: 0, fontSize: 12 }]}>
                    12-1 · #1
                  </Text>
                </PressableScale>
              </View>

              <View style={{ marginBottom: 20 }}>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: c.borderStrong,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: "61%",
                      height: "100%",
                      backgroundColor: c.red,
                      borderRadius: 2,
                    }}
                  />
                </View>
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
        </View>

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
                    <PressableScale
                      key={option}
                      onPress={() => setHotTakeVote(option)}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor:
                          hotTakeVote === option ? c.red : c.borderStrong,
                        backgroundColor:
                          hotTakeVote === option ? c.red : c.card,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: hotTakeVote === option ? "#fff" : c.text,
                          letterSpacing: 2,
                        }}
                      >
                        {option.toUpperCase()}
                      </Text>
                    </PressableScale>
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
