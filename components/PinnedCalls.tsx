import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";
import type { PinnedCall } from "../services/pins";

/** A player's pinned calls: what they called, on which fight, and what it
 * scored. On their profile and on the card others open. `compact` drops the
 * card around each, for inside a sheet. */
export default function PinnedCalls({ calls, compact = false }: { calls: PinnedCall[]; compact?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: compact ? 10 : 8 }}>
      {calls.map((call, i) => (
        <Animated.View
          key={call.boutId}
          entering={appear(i)}
          style={[
            { flexDirection: "row", alignItems: "center", gap: 12 },
            !compact && {
              backgroundColor: c.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
            },
          ]}
        >
          <Ionicons name="pin" size={16} color={c.red} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
              {call.call}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {call.fight} · {call.date}
            </Text>
          </View>
          <Text style={{ color: c.green, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{call.points}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
