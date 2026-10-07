import { Text, View } from "react-native";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { matchupOutcome, type Matchup } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";
import AnimatedBar from "./AnimatedBar";
import LiveDot from "./LiveDot";
import PressableScale from "./PressableScale";

const OUTCOME_TEXT = {
  won: "YOU WON",
  lost: "YOU LOST",
  drew: "DRAW",
  leading: "YOU LEAD",
  trailing: "YOU TRAIL",
  level: "LEVEL",
} as const;

/** A head-to-head on one card: both names and their points at the league's
 * tier. Your side is on the left. Tapping a side opens that player. */
export default function MatchupCard({
  matchup,
  onPressPlayer,
}: {
  matchup: Matchup;
  onPressPlayer?: (userId: string) => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const { a, b, state } = matchup;
  const outcome = matchup.isMine ? matchupOutcome(matchup) : null;

  const aLead = a.points != null && b.points != null && a.points > b.points;
  const bLead = a.points != null && b.points != null && b.points > a.points;
  // Your share of the positive points between you; negative cards count as 0.
  const pa = Math.max(a.points ?? 0, 0);
  const pb = Math.max(b.points ?? 0, 0);
  const share = pa + pb === 0 ? 50 : (pa / (pa + pb)) * 100;

  const side = (s: typeof a, lead: boolean, me: boolean) => (
    <PressableScale
      style={styles.versusSide}
      onPress={onPressPlayer ? () => onPressPlayer(s.userId) : undefined}
      disabled={!onPressPlayer}
      scaleTo={0.96}
    >
      <View style={[styles.versusAvatar, me && styles.versusAvatarMe]}>
        <Text style={styles.avatarText}>{getInitials(s.name)}</Text>
      </View>
      <Text style={styles.versusName} numberOfLines={1}>
        {me ? "You" : s.name}
      </Text>
      <Text style={[styles.versusScore, lead && styles.versusScoreLead]}>
        {s.points == null ? "—" : s.points}
      </Text>
    </PressableScale>
  );

  return (
    <View>
      <View style={styles.versusCard}>
        {side(a, aLead, matchup.isMine)}
        <View style={{ alignItems: "center", gap: 6 }}>
          {state === "live" && <LiveDot />}
          <Text style={styles.versusDivider}>VS</Text>
        </View>
        {side(b, bLead, false)}
      </View>
      {state !== "upcoming" && (
        <View style={{ marginTop: 12 }}>
          <AnimatedBar percent={share} />
          {outcome && (
            <Text
              style={{
                marginTop: 8,
                textAlign: "center",
                color: outcome === "won" || outcome === "leading" ? c.green : outcome === "lost" || outcome === "trailing" ? c.red : c.textMuted,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.5,
              }}
            >
              {OUTCOME_TEXT[outcome]}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
