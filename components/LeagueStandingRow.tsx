import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { rankLabel, type LeagueStanding } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";
import PressableScale from "./PressableScale";
import RankMark from "./RankMark";

const STATUS_NOTE: Partial<Record<LeagueStanding["status"], string>> = {
  queued: "NEXT SEASON",
  left: "LEAVING",
};

/** One member of a league table: rank and record, with the current streak
 * under it. Points still break ties but aren't shown: the table is about the
 * record. Unranked members (queued for next season) show no record. `move` is
 * places climbed since before the last card, for the arrow from 4th down. */
export default function LeagueStandingRow({
  row,
  index = 0,
  move,
  streak,
  animate = true,
  onPress,
}: {
  row: LeagueStanding;
  index?: number;
  move?: number;
  /** "W2", "L1" or "D1"; none before a matchup has finished. */
  streak?: string;
  /** False once the table has shown: a refresh must not replay the entrance. */
  animate?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const note = STATUS_NOTE[row.status];
  const ranked = row.rank != null;
  const subline = [ranked && row.forfeitWins ? `${row.forfeitWins} by forfeit` : null, note].filter(Boolean).join(" · ");
  const streakColor = streak?.startsWith("W") ? c.green : streak?.startsWith("L") ? c.red : c.textFaint;

  return (
    <Animated.View entering={animate ? appear(Math.min(index, 8)) : undefined}>
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
          {subline ? <Text style={styles.playerTeam}>{subline}</Text> : null}
        </View>

        <View>
          <Text style={styles.points}>{ranked ? row.record : "—"}</Text>
          {ranked && streak ? <Text style={[styles.pointsUnit, { color: streakColor }]}>{streak}</Text> : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}
