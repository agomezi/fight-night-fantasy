import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useNextEvent } from "../hooks/useNextEvent";
import { splitEventName } from "../services/events";
import { pickRuleLabel, TIER_LABEL, type MyLeague } from "../services/leagues";
import { loadPicks } from "../services/picks";
import { requiredBouts } from "../services/tierPicks";
import { makeLeaguesStyles } from "../styles/leagues";
import AnimatedBar from "./AnimatedBar";
import PressableScale from "./PressableScale";

/** Your picks for this league's next card: how many of the fights it
 * requires you've locked in, and a way straight to the ones still open. The
 * same picks as the Picks tab, which also count for global. */
export default function LeaguePicksCard({ league }: { league: MyLeague }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const router = useRouter();
  const next = useNextEvent();
  const event = next.status === "ready" ? next.event : null;
  const [saved, setSaved] = useState<Set<string> | null>(null);

  // Saved picks only: unsaved edits don't count for the league.
  const eventId = event?.id;
  useFocusEffect(
    useCallback(() => {
      if (!event) return;
      let current = true;
      loadPicks(event.bouts)
        .then((p) => current && setSaved(new Set(Object.keys(p))))
        .catch(() => {});
      return () => {
        current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId])
  );

  if (!event || !saved) return null;
  // A fight changed after it locked is void and required by nobody.
  const required = requiredBouts(
    league.tier,
    event.bouts.filter((b) => !b.changedAfterLock),
    league.rule
  );
  if (!required.length) return null;

  const picked = required.filter((b) => saved.has(b.id)).length;
  const missedLocked = required.filter((b) => !saved.has(b.id) && b.locksAt.getTime() <= next.now.getTime()).length;
  const done = picked === required.length;
  const rule = league.rule ? pickRuleLabel(league.rule) : TIER_LABEL[league.tier];

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Your picks</Text>
        <Text style={[styles.cardMeta, { flexShrink: 1, marginLeft: 10 }]} numberOfLines={1}>
          {(splitEventName(event.name).headline ?? splitEventName(event.name).title).toUpperCase()}
        </Text>
      </View>
      <View style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name={done ? "checkmark-circle" : missedLocked ? "alert-circle" : "list"}
            size={20}
            color={done ? c.green : missedLocked ? c.red : c.text2}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>
              {done ? `Locked in for ${league.name}` : `${picked} of ${required.length} required picked`}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>
              {missedLocked && !done
                ? `${missedLocked} required fight${missedLocked === 1 ? "" : "s"} locked unpicked, so this week is a forfeit.`
                : `${league.name} needs: ${rule.toLowerCase()}`}
            </Text>
          </View>
        </View>
        {!done && <AnimatedBar percent={(picked / required.length) * 100} height={4} style={{ marginTop: 12 }} />}
        {!(missedLocked && !done) && (
          <PressableScale
            onPress={() => router.push(`/picks?league=${league.id}`)}
            style={{
              marginTop: 12,
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: done ? "transparent" : c.red,
              borderWidth: done ? 1 : 0,
              borderColor: c.border,
            }}
          >
            <Text style={{ color: done ? c.text2 : "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>
              {done ? "EDIT PICKS" : "FINISH YOUR PICKS"}
            </Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}
