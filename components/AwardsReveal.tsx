import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo } from "react";
import { holdModal } from "../services/modalGate";
import { Dimensions, Modal, ScrollView, Share, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";
import { AWARDS, champTitle, dropHeading, shareText, yourLine, type LeagueDrop } from "../services/awards";
import PressableScale from "./PressableScale";
import RankMark from "./RankMark";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CONFETTI = 28;

/** One piece of confetti: drops from above the card, tumbling. */
function Piece({ i, color }: { i: number; color: string }) {
  const fall = useSharedValue(0);
  const x = useMemo(() => Math.round(((i * 37) % 100) / 100 * SCREEN_W), [i]);
  const drift = useMemo(() => ((i * 53) % 60) - 30, [i]);
  useEffect(() => {
    fall.value = withDelay((i % 7) * 70, withTiming(1, { duration: 1600 + (i % 5) * 220, easing: Easing.out(Easing.quad) }));
  }, [fall, i]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - fall.value * 0.9,
    transform: [
      { translateY: -40 + fall.value * SCREEN_H * 0.75 },
      { translateX: drift * fall.value },
      { rotate: `${fall.value * (i % 2 ? 540 : -540)}deg` },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top: 0, left: x, width: i % 3 ? 7 : 10, height: i % 3 ? 12 : 6, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** A league's award drop, celebrated: the champion, every award, your own
 * line, where the season's heading, and a way to share it. */
export default function AwardsReveal({
  leagueName,
  drop,
  myId,
  onClose,
}: {
  leagueName: string;
  drop: LeagueDrop;
  myId: string | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  // Nothing else opens over it.
  useEffect(() => holdModal(), []);
  const champs = drop.awards.filter((a) => a.award === "interim_champ" || a.award === "champ");
  const rest = drop.awards.filter((a) => a.award !== "interim_champ" && a.award !== "champ");
  const you = yourLine(drop, myId);
  const ahead = drop.table.filter((r) => r.projected).slice(0, 3);
  const meRow = drop.table.find((r) => r.userId === myId && r.projected && !ahead.includes(r));
  const colors = [c.red, c.gold, "#FFFFFF", c.red, c.gold];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: "center", padding: 18 }}>
        {Array.from({ length: CONFETTI }, (_, i) => (
          <Piece key={i} i={i} color={colors[i % colors.length]} />
        ))}
        <Animated.View
          entering={appear()}
          style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.border, maxHeight: "88%", overflow: "hidden" }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 22, gap: 14 }}>
            <View>
              <Text style={{ color: c.red, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
                {dropHeading(drop.drop)} · {leagueName.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: "BebasNeue", fontSize: 34, color: c.text, letterSpacing: 0.5, marginTop: 2 }}>
                The awards are in
              </Text>
            </View>

            {champs.length > 0 && (
              <View style={{ alignItems: "center", backgroundColor: c.inset, borderRadius: 16, paddingVertical: 18, gap: 6 }}>
                <RankMark rank={1} size={44} />
                <Text style={{ color: c.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginTop: 4 }}>
                  {champTitle(drop.drop).toUpperCase()}
                </Text>
                <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }} numberOfLines={1}>
                  {champs.map((a) => a.name).join(" & ")}
                </Text>
              </View>
            )}

            {you && (
              <Text style={{ color: c.text2, fontSize: 14, fontWeight: "600", textAlign: "center" }}>{you}</Text>
            )}

            <View style={{ gap: 10 }}>
              {rest.map((a, i) => {
                const info = AWARDS[a.award];
                const stat = a.value == null ? "" : info.stat(a.value);
                return (
                  <Animated.View
                    key={`${a.award}-${a.userId}`}
                    entering={appear(Math.min(i + 1, 8))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: info.joke ? 0.85 : 1 }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: c.inset,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={info.icon} size={16} color={info.joke ? c.textMuted : c.red} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
                        {info.title.toUpperCase()}
                      </Text>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>
                        {a.name}
                        {a.userId === myId ? <Text style={{ color: c.red }}>  YOU</Text> : null}
                      </Text>
                    </View>
                    {!!stat && <Text style={{ color: c.text2, fontSize: 12.5, fontWeight: "600" }}>{stat}</Text>}
                  </Animated.View>
                );
              })}
            </View>

            {ahead.length > 0 && (
              <View style={{ backgroundColor: c.inset, borderRadius: 14, padding: 14, gap: 6 }}>
                <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>
                  AT THIS PACE · AN 11-CARD SEASON
                </Text>
                {[...ahead, ...(meRow ? [meRow] : [])].map((r) => (
                  <View key={r.userId} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ flex: 1, color: r.userId === myId ? c.red : c.text, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                      {r.rank != null ? `${r.rank}. ` : ""}
                      {r.name}
                    </Text>
                    <Text style={{ color: c.text2, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                      {r.projected!.wins}-{r.projected!.losses}
                      {r.projected!.draws ? `-${r.projected!.draws}` : ""} · {r.projected!.points.toLocaleString()} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {drop.p4p && (
              <Text style={{ color: c.textMuted, fontSize: 12.5, textAlign: "center" }}>
                P4P #1 on the global board: <Text style={{ color: c.text, fontWeight: "700" }}>{drop.p4p.name}</Text>
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <PressableScale
                onPress={() => Share.share({ message: shareText(leagueName, drop) }).catch(() => {})}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  gap: 6,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 12,
                  paddingVertical: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                }}
              >
                <Ionicons name="share-outline" size={16} color={c.text} />
                <Text style={{ color: c.text, fontSize: 13, fontWeight: "800", letterSpacing: 1 }}>SHARE</Text>
              </PressableScale>
              <PressableScale
                onPress={onClose}
                style={{ flex: 1, backgroundColor: c.red, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800", letterSpacing: 1 }}>NICE</Text>
              </PressableScale>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
