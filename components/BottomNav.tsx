import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Path, Svg } from "react-native-svg";
import { COLORS } from "../constants/colors";

// The persistent bottom bar from the mocks. It's a plain presentational
// component (not an Expo Router Tabs navigator) so the app keeps its flat
// screen layout — each tab just router.push()es to a screen.
type TabKey = "home" | "picks" | "leagues" | "profile";

const TABS: { key: TabKey; label: string; route: string }[] = [
  { key: "home", label: "HOME", route: "/home" },
  { key: "picks", label: "PICKS", route: "/picks" },
  { key: "leagues", label: "LEAGUES", route: "/leagues" },
  { key: "profile", label: "PROFILE", route: "/profile" },
];

function TabIcon({ tab, color }: { tab: TabKey; color: string }) {
  if (tab === "home") return <Ionicons name="home-outline" size={22} color={color} />;
  if (tab === "leagues") return <Ionicons name="medal-outline" size={22} color={color} />;
  if (tab === "profile") return <Ionicons name="person-outline" size={22} color={color} />;
  // picks: a target/crosshair to match the mock
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 100 10 5 5 0 000-10z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export default function BottomNav({ active }: { active: TabKey }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", paddingTop: 10 }}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? COLORS.red : "#6b6b6b";
        return (
          <Pressable
            key={tab.key}
            // Only Events + Picks exist so far; Leagues/Profile are placeholders.
            onPress={() => {
              if (isActive) return;
              if (tab.key === "home" || tab.key === "picks") {
                // navigate() reuses the screen if it's already in the stack
                // (tab-like), instead of push() stacking a duplicate.
                router.navigate(tab.route as never);
              }
            }}
            style={{ flex: 1, alignItems: "center", gap: 4 }}
          >
            <TabIcon tab={tab.key} color={color} />
            <Text style={{ color, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
