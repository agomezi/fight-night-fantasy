import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useNextEvent } from "../hooks/useNextEvent";
import { loadPickStatus, type MemberPickStatus, type MyLeague } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";

/** The owner's view of who has made the league's required picks for the
 * next card, fewest first, so they can chase people in their group chat.
 * Counts only: nobody's picks show before they lock. */
export default function LeaguePickStatus({ league }: { league: MyLeague }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const next = useNextEvent();
  const event = next.status === "ready" ? next.event : null;
  // Keyed to the league they're for, so switching leagues never shows the
  // last one's rows.
  const [loaded, setLoaded] = useState<{ leagueId: string; rows: MemberPickStatus[] } | null>(null);

  const eventId = event?.id;
  useFocusEffect(
    useCallback(() => {
      if (!eventId || !league.isOwner) return;
      let current = true;
      loadPickStatus(league.id, eventId)
        .then((rows) => current && setLoaded({ leagueId: league.id, rows }))
        .catch(() => {});
      return () => {
        current = false;
      };
    }, [eventId, league.id, league.isOwner])
  );

  const rows = loaded?.leagueId === league.id ? loaded.rows : null;
  if (!league.isOwner || !rows || !rows.length || !rows[0].required) return null;
  const short = rows.filter((r) => r.picked < r.required).length;

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Who&apos;s picked</Text>
        <Text style={styles.cardMeta}>{short ? `${short} SHORT` : "EVERYONE'S IN"}</Text>
      </View>
      <View style={{ marginTop: 10, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 }}>
        {rows.map((r, i) => {
          const done = r.picked >= r.required;
          return (
            <View
              key={r.userId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 11,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: c.border,
                gap: 10,
              }}
            >
              <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: r.isMe ? "800" : "600" }} numberOfLines={1}>
                {r.isMe ? `${r.name} (you)` : r.name}
              </Text>
              <Text style={{ color: done ? c.green : r.missed ? c.red : c.textMuted, fontSize: 12.5, fontWeight: "700" }}>
                {done ? `${r.picked}/${r.required}` : r.missed ? `${r.picked}/${r.required} · missed` : `${r.picked}/${r.required} · short`}
              </Text>
              {done && <Ionicons name="checkmark-circle" size={15} color={c.green} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}
