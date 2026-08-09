import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Path, Svg } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { useToggleProgress } from "../hooks/useToggleProgress";
import PressableScale from "./PressableScale";

type TabKey = "home" | "picks" | "leagues" | "profile";

const TABS: { key: TabKey; label: string; route: string }[] = [
  { key: "home", label: "HOME", route: "/home" },
  { key: "picks", label: "PICKS", route: "/picks" },
  { key: "leagues", label: "LEAGUES", route: "/leagues" },
  { key: "profile", label: "PROFILE", route: "/profile" },
];

function TabIcon({ tab, color }: { tab: TabKey; color: string }) {
  // Home is the cage, not a house — the one nav slot that should say what
  // kind of app this is rather than borrowing the generic icon.
  if (tab === "home") {
    return (
      <Svg width={22} height={22} viewBox="0 0 80 80" fill="none">
        <Path
          d="M67.7 51.5 51.5 67.7H28.5L12.3 51.5V28.5L28.5 12.3h23L67.7 28.5z"
          stroke={color}
          strokeWidth={6}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (tab === "leagues") return <Ionicons name="medal-outline" size={22} color={color} />;
  if (tab === "profile") return <Ionicons name="person-outline" size={22} color={color} />;
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

function Tab({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const progress = useToggleProgress(isActive);
  const color = isActive ? c.red : c.textFaint;

  // The icon lifts and grows a touch on the active tab — enough to find your
  // place without a heavy highlight sitting under it.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + progress.value * 0.12 },
      { translateY: -progress.value * 2 },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));

  return (
    <PressableScale
      onPress={onPress}
      haptic={isActive ? "none" : "light"}
      scaleTo={0.9}
      style={{ flex: 1, alignItems: "center", gap: 4 }}
    >
      <Animated.View style={iconStyle}>
        <TabIcon tab={tab.key} color={color} />
      </Animated.View>
      <Text style={{ color, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
        {tab.label}
      </Text>
      <Animated.View
        style={[
          { width: 4, height: 4, borderRadius: 2, backgroundColor: c.red },
          dotStyle,
        ]}
      />
    </PressableScale>
  );
}

export default function BottomNav({ active }: { active: TabKey }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", paddingTop: 10 }}>
      {TABS.map((tab) => (
        <Tab
          key={tab.key}
          tab={tab}
          isActive={tab.key === active}
          onPress={() => {
            if (tab.key === active) return;
            router.navigate(tab.route as never);
          }}
        />
      ))}
    </View>
  );
}
