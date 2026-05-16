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
              tag: "",
            },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
