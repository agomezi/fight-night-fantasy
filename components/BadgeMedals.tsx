import { Ionicons } from "@expo/vector-icons";
import { Alert, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { EarnedBadge } from "../services/locker";
import PressableScale from "./PressableScale";

/** Rare badges as gold medallions in a row; tap one for what it's for. */
export default function BadgeMedals({ badges, size = 32 }: { badges: EarnedBadge[]; size?: number }) {
  const { c } = useTheme();
  if (!badges.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {badges.map((b) => (
        <PressableScale
          key={b.id}
          onPress={() => Alert.alert(b.title, b.blurb)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${b.title} badge`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${c.gold}1A`,
            borderWidth: 1,
            borderColor: `${c.gold}66`,
          }}
        >
          <Ionicons name={b.icon} size={Math.round(size * 0.47)} color={c.gold} />
        </PressableScale>
      ))}
    </View>
  );
}
