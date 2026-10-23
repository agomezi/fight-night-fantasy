import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { Badge } from "../services/awards";

/** Awards a player locked in at a season's end, as badges. On their profile
 * and on the card others open. */
export default function BadgesBlock({ badges }: { badges: Badge[] }) {
  const { c } = useTheme();
  if (!badges.length) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {badges.map((b) => (
        <View
          key={`${b.season}-${b.award}-${b.scope}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: b.joke ? c.inset : c.redTint,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Ionicons name={b.icon} size={13} color={b.joke ? c.textMuted : c.red} />
          <Text style={{ color: c.text, fontSize: 12.5, fontWeight: "700" }}>{b.title}</Text>
          <Text style={{ color: c.textMuted, fontSize: 11 }}>
            {b.scope} · {b.season}
          </Text>
        </View>
      ))}
    </View>
  );
}
