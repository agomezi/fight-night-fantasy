import { Text, View } from "react-native";
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
 * places climbed since before the last card, for the arrow from 4th down. Not
 * animated on its own: a refresh reorders the rows, and an entrance on a
 * moved row can leave it invisible, so the table animates in as a whole. */
export default function LeagueStandingRow({
  row,
  move,
  streak,
  crowned,
  seed,
  interim,
  onPress,
}: {
  row: LeagueStanding;
  move?: number;
  /** "W2", "L1" or "D1"; none before a matchup has finished. */
  streak?: string;
  /** A Champion holds the belt above the table: 1st takes a gold medal. */
  crowned?: boolean;
  /** Their seed for the title shot, once the field is set. */
  seed?: number;
  /** The Interim Champ, named at the midseason review while the belt is vacant. */
  interim?: boolean;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const titleNote = [interim ? "INTERIM CHAMP" : null, seed != null ? `TITLE SHOT · #${seed} SEED` : null]
    .filter(Boolean)
    .join(" · ");
  const note = STATUS_NOTE[row.status] ?? (titleNote || undefined);
  const ranked = row.rank != null;
  const streakColor = streak?.startsWith("W") ? c.green : streak?.startsWith("L") ? c.red : c.textFaint;

  return (
    <View>
      <PressableScale
        onPress={onPress}
        disabled={!onPress}
        scaleTo={0.98}
        style={[styles.standingRow, row.isMe && styles.standingRowMe]}
      >
        <View style={styles.rankCell}>
          <View style={styles.rankMark}>
            <RankMark rank={row.rank} move={move} size={18} crowned={crowned} />
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
          {note ? <Text style={styles.playerTeam}>{note}</Text> : null}
        </View>

        <View>
          <Text style={styles.points}>{ranked ? row.record : "—"}</Text>
          {ranked && streak ? <Text style={[styles.pointsUnit, { color: streakColor }]}>{streak}</Text> : null}
        </View>
      </PressableScale>
    </View>
  );
}
