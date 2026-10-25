import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useThemedStyles } from "../context/ThemeContext";
import { rankLabel, type LeagueStanding } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";
import PressableScale from "./PressableScale";
import RankMark from "./RankMark";

const STATUS_NOTE: Partial<Record<LeagueStanding["status"], string>> = {
  queued: "NEXT SEASON",
  left: "LEAVING",
};

/** One member of a league table: rank, record and points. Unranked members
 * (queued for next season) show their points with no rank. `move` is places
 * climbed since before the last card, for the arrow from 4th down. */
export default function LeagueStandingRow({
  row,
  index = 0,
  move,
  onPress,
}: {
  row: LeagueStanding;
  index?: number;
  move?: number;
  onPress?: () => void;
}) {
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
          <View style={styles.rankMark}>
            <RankMark rank={row.rank} move={move} size={18} />
          </View>
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
            {[
              row.rank != null ? row.record : null,
              accuracy,
              note,
            ]
              .filter(Boolean)
              .join(" · ") || "No picks scored"}
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
