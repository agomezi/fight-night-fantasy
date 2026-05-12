import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatBox, StatBoxRow } from "../components/StatBox";
import SwipeableCards from "../components/SwipeableCards";
import { commonStyles } from "../styles/common";

export default function Home() {
  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: "#0A0A0A" }]}
    >
      <ScrollView>
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
        <View style={commonStyles.cardWrapper}>
          <Text style={[commonStyles.cardTitle, { textAlign: "left" }]}>
            Your Performance
          </Text>
          <Text style={[commonStyles.cardSubtitle, { marginTop: 9 }]}>
            View History
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
