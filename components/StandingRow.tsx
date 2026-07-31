import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { Standing } from "../constants/league";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { makeLeaguesStyles } from "../styles/leagues";

function MoveIndicator({ move }: { move: number }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  if (move === 0) {
    return <Text style={[styles.moveText, styles.moveFlat]}>—</Text>;
  }
  const up = move > 0;
  return (
    <View style={styles.moveRow}>
      <Ionicons
        name={up ? "arrow-up" : "arrow-down"}
        size={10}
        color={up ? c.green : c.red}
      />
      <Text style={[styles.moveText, up ? styles.moveUp : styles.moveDown]}>
        {Math.abs(move)}
      </Text>
    </View>
  );
}

export default function StandingRow({
  standing,
  showTeam = true,
  padRank = false,
}: {
  standing: Standing;
  showTeam?: boolean;
  padRank?: boolean;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const { rank, name, team, points, move, isMe } = standing;

  return (
    <View style={[styles.standingRow, isMe && styles.standingRowMe]}>
      <View style={styles.rankCell}>
        {rank === 1 && (
          <View style={styles.crown}>
            <Ionicons name="trophy" size={12} color={c.red} />
          </View>
        )}
        <Text style={[styles.rank, !isMe && rank > 3 && styles.rankMuted]}>
          {padRank && rank < 10 ? `0${rank}` : rank}
        </Text>
        <MoveIndicator move={move} />
      </View>

      <View style={[styles.avatar, isMe && styles.avatarMe]}>
        <Text style={styles.avatarText}>{getInitials(name)}</Text>
      </View>

      <View style={styles.playerCell}>
        <Text style={[styles.playerName, isMe && styles.playerNameMe]}>{name}</Text>
        {showTeam && <Text style={styles.playerTeam}>{team}</Text>}
      </View>

      <View>
        <Text style={styles.points}>
          {points.toLocaleString(undefined, { minimumFractionDigits: 1 })}
        </Text>
        <Text style={styles.pointsUnit}>PTS</Text>
      </View>
    </View>
  );
}
