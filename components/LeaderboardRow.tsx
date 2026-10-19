import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import type { LeaderboardRow as Row } from "../services/leaderboard";
import PressableScale from "./PressableScale";

function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${-points}` : "0";
}

/** One player on the global leaderboard. Your own row is tinted; tapping a
 * row opens that player's card. */
export default function LeaderboardRow({
  row,
  index = 0,
  last = false,
  onPress,
}: {
  row: Row;
  index?: number;
  last?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <Animated.View entering={appear(Math.min(index, 8))}>
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
          {row.tied ? `T-${row.rank}` : row.rank}
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
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
            {row.name}
            {row.isMe && <Text style={{ color: c.red, fontSize: 11, fontWeight: "800" }}>  YOU</Text>}
          </Text>
          <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 1 }}>
            {row.cards} card{row.cards === 1 ? "" : "s"}
            {row.accuracy != null ? ` · ${row.accuracy}% called` : ""}
            {` · ${signed(row.points)} pts`}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              color: row.edge > 0 ? c.green : row.edge < 0 ? c.red : c.text,
              fontSize: 17,
              fontWeight: "800",
              fontVariant: ["tabular-nums"],
            }}
          >
            {signed(row.edge)}
          </Text>
          <Text style={{ color: c.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 1 }}>EDGE</Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
