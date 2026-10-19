import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import PressableScale from "../components/PressableScale";
import { appear } from "../constants/motion";
import { WHATS_NEW } from "../constants/whatsNew";
import { useTheme } from "../context/ThemeContext";

/** "Oct 19, 2026" */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Every update's notes, newest first: the same entries the "what's new"
 * card shows once after each update. */
export default function PatchNotes() {
  const router = useRouter();
  const { c } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
        <PressableScale onPress={() => router.back()} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", width: 80 }}>
          <Ionicons name="chevron-back" size={22} color={c.text2} />
          <Text style={{ color: c.text2, fontSize: 16 }}>Back</Text>
        </PressableScale>
        <Text style={{ flex: 1, textAlign: "center", color: c.text, fontSize: 17, fontWeight: "700" }}>Patch Notes</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 28 }}>
        {WHATS_NEW.map((entry, i) => (
          <Animated.View key={entry.id} entering={appear(Math.min(i, 6))}>
            <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
              {day(entry.date).toUpperCase()}
            </Text>
            <Text style={{ fontFamily: "BebasNeue", fontSize: 30, color: c.text, letterSpacing: 0.5, marginTop: 2 }}>
              {entry.title}
            </Text>
            <View style={{ width: 32, height: 3, backgroundColor: c.red, borderRadius: 2, marginTop: 2, marginBottom: 14 }} />
            <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, gap: 16 }}>
              {entry.items.map((item) => (
                <View key={item.title} style={{ flexDirection: "row", gap: 12 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: c.inset,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={item.icon} size={15} color={c.red} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>{item.title}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>{item.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
