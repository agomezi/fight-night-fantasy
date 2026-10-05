import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { rankLabel, type LeagueStanding } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";
import PressableScale from "./PressableScale";

const STATUS_NOTE: Partial<Record<LeagueStanding["status"], string>> = {
  queued: "NEXT SEASON",
  left: "LEAVING",
};

/** One member of a league table: rank, record and points. Unranked members
 * (queued for next season) show their points with no rank. */
export default function LeagueStandingRow({
  row,
  index = 0,
  onPress,
}: {
  row: LeagueStanding;
  index?: number;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const note = STATUS_NOTE[row.status];
  const accuracy = row.accuracy == null ? null : `${row.accuracy}%`;

  return (
    <Animated.View entering={appear(Math.min(index, 8))}>
      <PressableScale
        onPress={onPress}
        disabled={!onPress}
        scaleTo={0.98}
        style={[styles.standingRow, row.isMe && styles.standingRowMe]}
      >
        <View style={styles.rankCell}>
          {row.rank === 1 && (
            <View style={styles.crown}>
              <Ionicons name="trophy" size={12} color={c.red} />
            </View>
          )}
          <Text style={[styles.rank, !row.isMe && (row.rank == null || row.rank > 3) && styles.rankMuted]}>
            {rankLabel(row.rank, row.tied)}
          </Text>
        </View>

        <View style={[styles.avatar, row.isMe && styles.avatarMe]}>
          <Text style={styles.avatarText}>{getInitials(row.name)}</Text>
        </View>

        <View style={styles.playerCell}>
          <Text style={[styles.playerName, row.isMe && styles.playerNameMe]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.playerTeam}>
            {[row.rank != null ? row.record : null, accuracy, note].filter(Boolean).join(" · ") || "No picks scored"}
          </Text>
        </View>

        <View>
          <Text style={styles.points}>{row.points.toLocaleString()}</Text>
          <Text style={styles.pointsUnit}>PTS</Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
