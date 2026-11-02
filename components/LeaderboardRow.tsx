import { Text, View } from "react-native";
import { getInitials } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import type { LeaderboardRow as Row } from "../services/leaderboard";
import PressableScale from "./PressableScale";

/** Season totals read as scores: a minus when negative, never a plus. Edge
 * keeps its green or red. */
function total(points: number): string {
  return points < 0 ? `−${-points}` : `${points}`;
}

/** One player on the global leaderboard. Your own row is tinted; tapping a
 * row opens that player's card. Not animated on its own: a live refresh
 * reorders the rows, and an entrance on a moved row can leave it invisible,
 * so the list animates in as a whole instead. */
export default function LeaderboardRow({
  row,
  last = false,
  onPress,
}: {
  row: Row;
  last?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      <PressableScale
        onPress={onPress}
        disabled={!onPress}
        scaleTo={0.98}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: row.isMe ? 10 : 0,
          marginHorizontal: row.isMe ? -10 : 0,
          borderRadius: row.isMe ? 10 : 0,
          backgroundColor: row.isMe ? c.redTint : "transparent",
          borderBottomWidth: last || row.isMe ? 0 : 1,
          borderBottomColor: c.border,
        }}
      >
        <Text style={{ width: 36, color: c.text, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {row.rank == null ? "–" : row.tied ? `T-${row.rank}` : row.rank}
        </Text>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: c.input,
            borderWidth: 1.5,
            borderColor: row.isMe ? c.red : c.borderStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: c.textMuted }}>{getInitials(row.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {row.rank === 1 && !row.tied && (
            <Text style={{ color: c.gold, fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 }}>P4P #1</Text>
          )}
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
            {row.name}
            {row.isMe && <Text style={{ color: c.red, fontSize: 11, fontWeight: "800" }}>  YOU</Text>}
          </Text>
          <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 1 }}>
            {row.cards} card{row.cards === 1 ? "" : "s"}
            {row.accuracy != null ? ` · ${row.accuracy}% called` : ""}
            {` · ${total(row.points)} pts`}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              color: row.edge == null ? c.textFaint : row.edge > 0 ? c.green : row.edge < 0 ? c.red : c.text,
              fontSize: 17,
              fontWeight: "800",
              fontVariant: ["tabular-nums"],
            }}
          >
            {row.edge == null ? "—" : total(row.edge)}
          </Text>
          <Text style={{ color: c.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 }}>EDGE</Text>
        </View>
      </PressableScale>
    </View>
  );
}
