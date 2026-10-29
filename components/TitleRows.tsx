import { Text, View } from "react-native";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { champLine, type LeagueTitle } from "../services/titleFights";
import { makeLeaguesStyles } from "../styles/leagues";
import PressableScale from "./PressableScale";
import { TitleBelt } from "./RankMark";

/** The league's gold, as on the league card's tag. */
export const TITLE_GOLD = "#E8A020";

/** The C slot above the table: the Champion with the belt, or the title
 * vacant. Outside the numbering, so a Champion low in the table keeps their
 * real place below. */
export function ChampRow({
  title,
  myId,
  onPress,
}: {
  title: LeagueTitle;
  myId?: string | null;
  onPress?: (userId: string) => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const champ = title.champion;
  const me = !!champ && champ.userId === myId;

  return (
    <PressableScale
      onPress={champ && onPress ? () => onPress(champ.userId) : undefined}
      disabled={!champ || !onPress}
      scaleTo={0.98}
      style={[styles.standingRow, { borderWidth: 1, borderColor: "rgba(232,160,32,0.45)", marginBottom: 4 }]}
    >
      <View style={styles.rankCell}>
        <View style={styles.rankMark}>{champ ? <TitleBelt height={14} /> : null}</View>
        <Text style={[styles.rank, { color: TITLE_GOLD }]}>C</Text>
      </View>
      <View style={[styles.avatar, me && styles.avatarMe, !champ && { opacity: 0.35 }]}>
        <Text style={styles.avatarText}>{champ ? getInitials(champ.name) : "—"}</Text>
      </View>
      <View style={styles.playerCell}>
        <Text style={[styles.playerName, me && styles.playerNameMe, !champ && { color: c.textMuted }]} numberOfLines={1}>
          {champ ? champ.name : "VACANT"}
        </Text>
        <Text style={styles.playerTeam}>{champLine(title)}</Text>
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
