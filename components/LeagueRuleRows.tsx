import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { RuleRow } from "../services/leagueOnboarding";

const ICON: Record<RuleRow["icon"], keyof typeof Ionicons.glyphMap> = {
  people: "people-outline",
  doubleheader: "copy-outline",
  minimum: "list-outline",
};

/** A league's rules, one row each: in the sheet before joining, and at the top
 * of League Settings. */
export default function LeagueRuleRows({ rows }: { rows: RuleRow[] }) {
  const { c } = useTheme();
  return (
    <>
      {rows.map((row) => (
        <View key={row.icon} style={{ flexDirection: "row", gap: 14, marginTop: 18 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: c.redTint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={ICON[row.icon]} size={20} color={c.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>{row.title}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{row.body}</Text>
          </View>
        </View>
      ))}
    </>
  );
}
