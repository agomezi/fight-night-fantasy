import { Text, View } from "react-native";
import { getInitials } from "../context/ProfileContext";
import { useThemedStyles } from "../context/ThemeContext";
import { champLine, type LeagueTitle } from "../services/titleFights";
import { makeLeaguesStyles } from "../styles/leagues";
import PressableScale from "./PressableScale";
import { TitleBelt } from "./RankMark";

/** The league's gold, as on the league card's tag. */
export const TITLE_GOLD = "#E8A020";

/** The C slot above the table: the Champion with the belt. Nothing while
 * the belt is vacant. Outside the numbering, so a Champion low in the table
 * keeps their real place below. */
export function ChampRow({
  title,
  myId,
  onPress,
}: {
  title: LeagueTitle;
  myId?: string | null;
  onPress?: (userId: string) => void;
}) {
  const styles = useThemedStyles(makeLeaguesStyles);
  const champ = title.champion;
  if (!champ) return null;
  const me = champ.userId === myId;

  return (
    <PressableScale
      onPress={onPress ? () => onPress(champ.userId) : undefined}
      disabled={!onPress}
      scaleTo={0.98}
      style={[styles.standingRow, { borderWidth: 1, borderColor: "rgba(232,160,32,0.45)", marginBottom: 4 }]}
    >
      <View style={styles.rankCell}>
        <View style={styles.rankMark}>
          <TitleBelt height={14} />
        </View>
        <Text style={[styles.rank, { color: TITLE_GOLD }]}>C</Text>
      </View>
      <View style={[styles.avatar, me && styles.avatarMe]}>
        <Text style={styles.avatarText}>{getInitials(champ.name)}</Text>
      </View>
      <View style={styles.playerCell}>
        <Text style={[styles.playerName, me && styles.playerNameMe]} numberOfLines={1}>
          {champ.name}
        </Text>
        <Text style={styles.playerTeam}>{champLine(champ)}</Text>
      </View>
    </PressableScale>
  );
}

/** The line under the last place that makes the title shot. */
export function TitleShotLine() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: TITLE_GOLD, opacity: 0.5 }} />
      <Text style={{ color: TITLE_GOLD, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }}>TITLE SHOT</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: TITLE_GOLD, opacity: 0.5 }} />
    </View>
  );
}
