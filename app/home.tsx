import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SwipeableCards from "../components/SwipeableCards";
import { commonStyles } from "../styles/common";

export default function Home() {
  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: "#0A0A0A" }]}
    >
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

      {/* <View style={[commonStyles.homeCard, { aspectRatio: 1.2 }]}>
        <Text style={[commonStyles.label, { color: "#e5003c" }]}>
          NEXT EVENT
        </Text>
        <Text style={[commonStyles.cardTitle, { textAlign: "left" }]}>
          UFC 300
        </Text>

        <Text
          style={[
            commonStyles.cardSubtitle,
            { textAlign: "left", fontWeight: "500", fontSize: 16 },
          ]}
        >
          PEREIRA VS HILL
        </Text>
      </View> */}
    </SafeAreaView>
  );
}
