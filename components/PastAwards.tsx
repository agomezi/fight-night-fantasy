import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { dropDate, loadLeagueDrop, loadLeagueDrops, pastDrops, type DropInfo, type LeagueDrop } from "../services/awards";
import AwardsReveal from "./AwardsReveal";
import PressableScale from "./PressableScale";

/** The league's award drops this season once they've left the league page,
 * newest first, each a tap from its reveal. Nothing until there's one. */
export default function PastAwards({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [list, setList] = useState<{ leagueId: string; drops: DropInfo[] } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [open, setOpen] = useState<LeagueDrop | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      loadLeagueDrops(leagueId)
        .then((drops) => current && setList({ leagueId, drops }))
        .catch(() => {});
      return () => {
        current = false;
      };
    }, [leagueId])
  );

  // Never another league's, while switching.
  const drops = list?.leagueId === leagueId ? pastDrops(list.drops, new Date()) : [];
  if (!drops.length) return null;

  const show = (drop: DropInfo) => {
    if (opening) return;
    setOpening(drop.id);
    loadLeagueDrop(leagueId, drop.id)
      .then((d) => d && setOpen(d))
      .catch((e) => Alert.alert("Couldn't open the awards", (e as Error).message))
      .finally(() => setOpening(null));
  };

  return (
    <View style={{ marginTop: 30 }}>
      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 6 }}>
        PAST AWARDS
      </Text>
      {drops.map((drop, i) => (
        <PressableScale
          key={drop.id}
          onPress={() => show(drop)}
          scaleTo={0.98}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 14,
            borderBottomWidth: i === drops.length - 1 ? 0 : 1,
            borderBottomColor: c.border,
          }}
        >
          <Ionicons name="trophy" size={18} color={c.gold} />
          <Text style={{ flex: 1, color: c.text, fontSize: 14.5, fontWeight: "700" }} numberOfLines={1}>
            {drop.label} awards
          </Text>
          <Text style={{ color: c.textFaint, fontSize: 12 }}>{dropDate(drop)}</Text>
          {opening === drop.id ? (
            <ActivityIndicator size="small" color={c.textFaint} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          )}
        </PressableScale>
      ))}
      {open && <AwardsReveal leagueName={leagueName} drop={open} myId={myId} onClose={() => setOpen(null)} />}
    </View>
  );
}
