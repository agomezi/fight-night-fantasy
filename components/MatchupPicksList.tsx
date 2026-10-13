import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import type { Matchup } from "../services/leagues";
import { loadMatchupPicks, type MatchupPicks, type PickSide } from "../services/matchupPicks";
import { makeLeaguesStyles } from "../styles/leagues";

const SEGMENT: Record<string, string> = { main: "MAIN CARD", prelims: "PRELIMS", early_prelims: "EARLY PRELIMS" };

/** Your picks next to your opponent's, bout by bout. Theirs show as each
 * section of the card starts; until then only whether they're locked in. */
export default function MatchupPicksList({ leagueId, matchup }: { leagueId: string; matchup: Matchup }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const [picks, setPicks] = useState<MatchupPicks | null>(null);
  const { eventId, state, a, b } = matchup;

  // Reloads as the matchup's points move, so picks fill in through the night.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    loadMatchupPicks(leagueId, eventId, b.userId)
      .then((p) => !cancelled && setPicks(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, eventId, b.userId, state, a.points, b.points]);

  if (!picks || !picks.rows.length) return null;

  const status = !picks.someHidden
    ? null
    : picks.theirLockedIn
      ? `${b.name} is locked in. Their picks show as each part of the card starts.`
      : `${b.name} hasn't locked in their picks yet.`;

  const pickText = (s: PickSide, other: PickSide, right: boolean) => {
    const align = right ? ({ alignItems: "flex-end" } as const) : null;
    if (s.kind === "hidden") {
      return (
        <View style={[styles.pickSide, align]}>
          <Ionicons name="lock-closed" size={14} color={c.textFaint} />
          <Text style={styles.pickMethod}>Shows at start</Text>
        </View>
      );
    }
    if (s.kind === "none") {
      return (
        <View style={[styles.pickSide, align]}>
          <Text style={[styles.pickName, { color: c.textFaint }]}>No pick</Text>
        </View>
      );
    }
    const [fighter, ...detail] = s.line.split(" · ");
    const ahead = s.points != null && (other.kind !== "pick" || other.points == null || s.points > other.points);
    return (
      <View style={[styles.pickSide, align]}>
        <Text style={styles.pickName} numberOfLines={1}>{fighter}</Text>
        {detail.length > 0 && <Text style={styles.pickMethod}>{detail.join(" · ")}</Text>}
        {s.points != null && (
          <Text style={[styles.pickPoints, ahead && s.points > 0 && styles.pickWinner]}>{s.points}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={[styles.cardHeader, { marginTop: 8 }]}>
        <Text style={styles.cardTitle}>Picks</Text>
        <Text style={[styles.cardMeta, { flexShrink: 1, marginLeft: 10 }]} numberOfLines={1}>
          YOU VS {b.name.toUpperCase()}
        </Text>
      </View>
      {status && (
        <Text style={{ color: picks.theirLockedIn ? c.text2 : c.textMuted, fontSize: 12.5, lineHeight: 18 }}>
          {status}
        </Text>
      )}
      {picks.rows.map((r, i) => (
        <Animated.View key={r.boutId} entering={appear(i)} style={styles.boutRow}>
          <View style={styles.boutHeader}>
            <Text style={[styles.boutName, { flex: 1, marginRight: 10 }]} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={[styles.cardMeta, { fontSize: 9, color: r.voided ? c.red : c.textFaint }]}>
              {r.voided ? "VOID" : i === 0 ? "MAIN EVENT" : SEGMENT[r.segment]}
            </Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            {pickText(r.mine, r.theirs, false)}
            <View style={styles.boutSpacer} />
            {pickText(r.theirs, r.mine, true)}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
