import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { AWARD_ORDER, AWARDS, ordinal, topPlacings, type Superlatives } from "../services/awards";

/** A player's superlatives from the latest drop: the awards they won, as
 * badges, and their best placings in the rest. On their profile and on the
 * card others open. */
export default function SuperlativesBlock({ data, compact = false }: { data: Superlatives; compact?: boolean }) {
  const { c } = useTheme();
  const won = [...data.awards]
    .filter((a) => a.award in AWARDS)
    .sort((x, y) => AWARD_ORDER.indexOf(x.award) - AWARD_ORDER.indexOf(y.award));
  const wonKeys = new Set(won.map((a) => `${a.award}:${a.scope}`));
  const places = topPlacings(data).filter((p) => !wonKeys.has(`${p.award}:${p.scope}`) && p.place > 1).slice(0, compact ? 2 : 3);
  if (!won.length && !places.length) return null;

  return (
    <View style={{ gap: 10 }}>
      {won.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {won.map((a) => {
            const info = AWARDS[a.award];
            return (
              <View
                key={`${a.award}-${a.scope}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: info.joke ? c.inset : c.redTint,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Ionicons name={info.icon} size={13} color={info.joke ? c.textMuted : c.red} />
                <Text style={{ color: c.text, fontSize: 12.5, fontWeight: "700" }}>{info.title}</Text>
                <Text style={{ color: c.textMuted, fontSize: 11 }}>{a.scope}</Text>
              </View>
            );
          })}
        </View>
      )}
      {places.map((p) => (
        <View key={`${p.award}-${p.scope}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ width: 38, color: c.text2, fontSize: 13, fontWeight: "800" }}>{ordinal(p.place)}</Text>
          <Text style={{ flex: 1, color: c.text, fontSize: 13.5 }} numberOfLines={1}>
            {AWARDS[p.award].title}
            <Text style={{ color: c.textMuted }}> · {p.scope}</Text>
          </Text>
        </View>
      ))}
      <Text style={{ color: c.textFaint, fontSize: 11 }}>{data.drop.label}</Text>
    </View>
  );
}
