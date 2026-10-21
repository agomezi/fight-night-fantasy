import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { awardsSeenKey } from "../constants/storage";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { loadLatestDrop, loadLeagueDrop, type LeagueDrop } from "../services/awards";
import { useModalsFree } from "../services/modalGate";
import AwardsReveal from "./AwardsReveal";
import PressableScale from "./PressableScale";

/** The league's latest award drop: revealed, with a celebration, the first
 * time you open the league after it's published (once nothing else is on
 * screen), and a button to see it again. Nothing until there's a drop. */
export default function LeagueAwards({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const free = useModalsFree();
  const [drop, setDrop] = useState<LeagueDrop | null>(null);
  const [unseen, setUnseen] = useState(false);
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      let current = true;
      (async () => {
        const latest = await loadLatestDrop();
        if (!latest || !current) return;
        const d = await loadLeagueDrop(leagueId, latest.id).catch(() => null);
        if (!d || !current) return;
        setDrop(d);
        const seen = await AsyncStorage.getItem(awardsSeenKey(myId, leagueId)).catch(() => null);
        if (current) setUnseen(seen !== d.drop.id);
      })();
      return () => {
        current = false;
      };
    }, [leagueId, myId])
  );

  // Revealed by itself once, a moment after the screen settles and once
  // nothing else (the what's-new card) is showing.
  useEffect(() => {
    if (!drop || !unseen || !free || open) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [drop, unseen, free, open]);

  if (!drop) return null;

  const close = () => {
    setOpen(false);
    setUnseen(false);
    if (myId) AsyncStorage.setItem(awardsSeenKey(myId, leagueId), drop.drop.id).catch(() => {});
  };

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        style={{
          marginTop: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: c.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: unseen ? c.gold : c.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Ionicons name="trophy" size={18} color={c.gold} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 14.5, fontWeight: "700" }}>{drop.drop.label} awards</Text>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>
            {unseen ? "New: see who won what" : "See the winners again"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
      </PressableScale>
      {open && <AwardsReveal leagueName={leagueName} drop={drop} myId={myId} onClose={close} />}
    </>
  );
}
