import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
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
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="60" fill="#1a0a0a" />
            <Circle cx="60" cy="60" r="59" fill="none" stroke="#E8003D" strokeWidth="2" />
            <Circle cx="60" cy="47" r="20" fill="#E8003D" fillOpacity="0.85" />
            <Path d="M20 108C20 84.8 37.9 68 60 68C82.1 68 100 84.8 100 108" fill="#E8003D" fillOpacity="0.85" />
          </Svg>
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Path d="M60 20C51.16 20 44 27.16 44 36V40.5C34.6 44.8 28 54.2 28 65V82L20 92V96H100V92L92 82V65C92 54.2 85.4 44.8 76 40.5V36C76 27.16 68.84 20 60 20Z" fill="#E8003D" />
            <Path d="M48 100C48 106.6 53.4 112 60 112C66.6 112 72 106.6 72 100H48Z" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="none" stroke={c.bg} strokeWidth="2" />
          </Svg>
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
              title: "DTC",
              subtitle: "You are in 3rd place",
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
              title: "#4",
              titleSize: 50,
              footer: (
                <Text
                  style={[commonStyles.cardSubtitle, { textAlign: "left" }]}
                >
                  Top 5% in &quot;Global Strikers&quot; League
                </Text>
              ),
            },
            {
              tag: "LAST EVENT POINTS",
              tagColor: c.textMuted,
              title: "842",
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
                      610
                    </Text>
                  </View>
                </>
              ),
            },
            {
              tag: "UFC 299 Recap",
              tagColor: c.text,
              tagSize: 22,
              footer: (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: c.inset,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: c.card,
                        borderWidth: 1,
                        borderColor: c.borderStrong,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: c.green,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <Text
                        style={[
                          commonStyles.cardTitle,
                          {
                            fontSize: 16,
                            textAlign: "left",
                            marginBottom: 2,
                          },
                        ]}
                      >
                        O&apos;Malley (W)
                      </Text>
                      <Text
                        style={[
                          commonStyles.cardSubtitle,
                          { textAlign: "left", marginBottom: 0 },
                        ]}
                      >
                        Method: KO/TKO
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: c.text,
                      }}
                    >
                      +120 PTS
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: c.inset,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: c.border,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: c.card,
                        borderWidth: 1,
                        borderColor: c.borderStrong,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: c.red,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="close" size={20} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <Text
                        style={[
                          commonStyles.cardTitle,
                          {
                            fontSize: 16,
                            textAlign: "left",
                            marginBottom: 2,
                          },
                        ]}
                      >
                        Poirier (L)
                      </Text>
                      <Text
                        style={[
                          commonStyles.cardSubtitle,
                          { textAlign: "left", marginBottom: 0 },
                        ]}
                      >
                        Method: Dec
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: c.text,
                      }}
                    >
                      -10 PTS
                    </Text>
                  </View>
                </View>
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
                <Pressable
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
                </Pressable>
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
                <Pressable
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
                </Pressable>
                <Text style={{ color: c.textFaint, fontWeight: "700", fontSize: 13 }}>
                  VS
                </Text>
                <Pressable
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
                </Pressable>
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

              <Pressable
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
              </Pressable>
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
                  <Pressable
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
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => router.push("/picks")}
                style={{ marginTop: 8, alignItems: "center" }}
              >
                <Text style={[commonStyles.cardSubtitle, { marginBottom: 0 }]}>
                  + 9 more fights →
                </Text>
              </Pressable>
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
                    <Pressable
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
                    </Pressable>
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
