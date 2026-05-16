import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import InfoCards from "../components/InfoCards";
import { StatBox, StatBoxRow } from "../components/StatBox";
import SwipeableCards from "../components/SwipeableCards";
import { commonStyles } from "../styles/common";

export default function Home() {
  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: "#0A0A0A" }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={commonStyles.headerLogo}>PFP Fight Night BELL</Text>
        <View style={commonStyles.divider} />

        <SwipeableCards
          cards={[
            {
              tag: "NEXT EVENT",
              tagColor: "#e5003c",
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
              tagColor: "#707079",
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
              tagColor: "#707079",
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
              tagColor: "#FFFFFF",
              tagSize: 22,
              footer: (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#0f0f0f",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#222224",
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: "#111111",
                        borderWidth: 1,
                        borderColor: "#333333",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: "#00C853",
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
                        color: "#fff",
                      }}
                    >
                      +120 PTS
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#0f0f0f",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#222224",
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        backgroundColor: "#111111",
                        borderWidth: 1,
                        borderColor: "#333333",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: "#E8003D",
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
                        color: "#fff",
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
      </ScrollView>
    </SafeAreaView>
  );
}
