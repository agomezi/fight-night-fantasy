import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import { COLORS } from "../constants/colors";
import { commonStyles } from "../styles/common";

type Fighter = { id: string; name: string; initials: string; record: string };
type Fight = {
  id: string;
  division: string;
  a: Fighter;
  b: Fighter;
  proof?: string;
};

const MAIN_EVENT: Fight = {
  id: "main",
  division: "LIGHT HEAVYWEIGHT",
  a: { id: "pereira", name: "PEREIRA", initials: "AP", record: "12-2" },
  b: { id: "hill", name: "HILL", initials: "JH", record: "12-1" },
  proof: "Vince and 2 others picked Hill",
};

const UNDERCARD: Fight[] = [
  {
    id: "zhang-yan",
    division: "STRAWWEIGHT",
    a: { id: "zhang", name: "ZHANG", initials: "ZW", record: "24-3" },
    b: { id: "yan", name: "YAN", initials: "XY", record: "17-4" },
    proof: "Vince and 4 others picked Zhang",
  },
  {
    id: "gaethje-holloway",
    division: "LIGHTWEIGHT",
    a: { id: "gaethje", name: "GAETHJE", initials: "JG", record: "25-4" },
    b: { id: "holloway", name: "HOLLOWAY", initials: "MH", record: "26-7" },
    proof: "8 people in your league picked Holloway",
  },
  {
    id: "oliveira-tsarukyan",
    division: "LIGHTWEIGHT",
    a: { id: "oliveira", name: "OLIVEIRA", initials: "CO", record: "34-9" },
    b: { id: "tsarukyan", name: "TSARUKYAN", initials: "AT", record: "21-3" },
    proof: "Split 50/50 in your league",
  },
];

const METHODS = ["KO/TKO", "SUB", "DEC"] as const;
const ROUNDS = [1, 2, 3, 4, 5] as const;

type PickMap = Record<string, string>; // fightId -> fighterId
type MethodMap = Record<string, string>; // fightId -> method
type RoundMap = Record<string, number>; // fightId -> round

function Avatar({
  initials,
  selected,
  size = 96,
}: {
  initials: string;
  selected?: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        backgroundColor: "#171717",
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? COLORS.red : "#2a2a2a",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size / 3 }}>
        {initials}
      </Text>
    </View>
  );
}

// Method-of-victory + round + community line. Shared by every fight when it's expanded.
function FightControls({
  method,
  round,
  proof,
  onMethod,
  onRound,
}: {
  method?: string;
  round?: number;
  proof?: string;
  onMethod: (m: string) => void;
  onRound: (r: number) => void;
}) {
  return (
    <>
      {/* Method of victory */}
      <Text style={styles.groupLabel}>METHOD OF VICTORY</Text>
      <View style={styles.segRow}>
        {METHODS.map((m) => {
          const active = method === m;
          return (
            <Pressable
              key={m}
              onPress={() => onMethod(m)}
              style={[styles.seg, active && styles.segActive]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Round — a decision goes the distance, so there's no round to pick. */}
      {method !== "DEC" && (
        <>
          <Text style={styles.groupLabel}>ROUND</Text>
          <View style={styles.segRow}>
            {ROUNDS.map((r) => {
              const active = round === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => onRound(r)}
                  style={[styles.roundBox, active && styles.segActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Community / social proof */}
      {proof && (
        <View style={styles.proof}>
          <View style={styles.proofAvatars}>
            {["#E8A020", "#9B59B6", "#3a7bd5"].map((c, i) => (
              <View
                key={i}
                style={[
                  styles.proofDot,
                  { backgroundColor: c, marginLeft: i === 0 ? 0 : -8 },
                ]}
              />
            ))}
          </View>
          <Text style={styles.proofText}>{proof}</Text>
        </View>
      )}
    </>
  );
}

export default function Picks() {
  const insets = useSafeAreaInsets();
  // If we arrived from the home Quick Pick, that fighter is already chosen for
  // the main event so the user lands with it selected and can set method/round.
  const { fighter } = useLocalSearchParams<{ fighter?: string }>();
  const [picks, setPicks] = useState<PickMap>(
    fighter ? { [MAIN_EVENT.id]: fighter } : {}
  );
  const [methods, setMethods] = useState<MethodMap>({});
  const [rounds, setRounds] = useState<RoundMap>({});
  // Which fight cards are open. Main event starts open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ main: true });

  const setPick = (fightId: string, fighterId: string) => {
    setPicks((p) => ({ ...p, [fightId]: fighterId }));
    // Picking a fighter opens that fight so you can set method/round right away.
    setExpanded((p) => ({ ...p, [fightId]: true }));
  };
  const setMethod = (fightId: string, m: string) =>
    setMethods((p) => ({ ...p, [fightId]: m }));
  const setRound = (fightId: string, r: number) =>
    setRounds((p) => ({ ...p, [fightId]: r }));
  const toggle = (fightId: string) =>
    setExpanded((p) => ({ ...p, [fightId]: !p[fightId] }));

  const totalFights = 1 + UNDERCARD.length;
  const madePicks = useMemo(() => Object.keys(picks).length, [picks]);

  return (
    <SafeAreaView
      style={[commonStyles.container, { backgroundColor: "#0A0A0A", padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
      >
        {/* Header — matches home.tsx */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="60" fill="#1a0a0a" />
            <Circle cx="60" cy="60" r="59" fill="none" stroke="#E8003D" strokeWidth="2" />
            <Circle cx="60" cy="47" r="20" fill="#E8003D" fillOpacity="0.85" />
            <Path d="M20 108C20 84.8 37.9 68 60 68C82.1 68 100 84.8 100 108" fill="#E8003D" fillOpacity="0.85" />
          </Svg>
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <Svg width={36} height={36} viewBox="0 0 120 120">
            <Path d="M60 20C51.16 20 44 27.16 44 36V40.5C34.6 44.8 28 54.2 28 65V82L20 92V96H100V92L92 82V65C92 54.2 85.4 44.8 76 40.5V36C76 27.16 68.84 20 60 20Z" fill="#E8003D" />
            <Path d="M48 100C48 106.6 53.4 112 60 112C66.6 112 72 106.6 72 100H48Z" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="#E8003D" />
            <Circle cx="88" cy="32" r="10" fill="none" stroke="#0A0A0A" strokeWidth="2" />
          </Svg>
        </View>
        <View style={commonStyles.divider} />

        {/* Title */}
        <Text style={styles.eventTitle}>UFC 300</Text>
        <Text style={styles.eventSub}>Make your picks. Lock them in.</Text>

        {/* Main event card */}
        <View style={styles.mainCard}>
          <Pressable style={styles.mainHeader} onPress={() => toggle(MAIN_EVENT.id)}>
            <Text style={styles.mainHeaderText}>
              MAIN EVENT{"  "}
              <Text style={{ color: COLORS.red }}>{MAIN_EVENT.division}</Text>
            </Text>
            <Ionicons
              name={expanded[MAIN_EVENT.id] ? "chevron-up" : "chevron-down"}
              size={18}
              color="#777"
            />
          </Pressable>

          {expanded[MAIN_EVENT.id] && (
            <View style={{ padding: 18, paddingTop: 4 }}>
              {/* Fighters */}
              <View style={styles.fighterRow}>
                <Pressable
                  style={styles.fighterCol}
                  onPress={() => setPick(MAIN_EVENT.id, MAIN_EVENT.a.id)}
                >
                  <Avatar
                    initials={MAIN_EVENT.a.initials}
                    selected={picks[MAIN_EVENT.id] === MAIN_EVENT.a.id}
                  />
                  <Text style={styles.fighterName}>{MAIN_EVENT.a.name}</Text>
                </Pressable>
                <Text style={styles.vs}>VS</Text>
                <Pressable
                  style={styles.fighterCol}
                  onPress={() => setPick(MAIN_EVENT.id, MAIN_EVENT.b.id)}
                >
                  <Avatar
                    initials={MAIN_EVENT.b.initials}
                    selected={picks[MAIN_EVENT.id] === MAIN_EVENT.b.id}
                  />
                  <Text style={styles.fighterName}>{MAIN_EVENT.b.name}</Text>
                </Pressable>
              </View>

              <FightControls
                method={methods[MAIN_EVENT.id]}
                round={rounds[MAIN_EVENT.id]}
                proof={MAIN_EVENT.proof}
                onMethod={(m) => setMethod(MAIN_EVENT.id, m)}
                onRound={(r) => setRound(MAIN_EVENT.id, r)}
              />
            </View>
          )}
        </View>

        {/* Undercard rows */}
        {UNDERCARD.map((fight) => {
          const picked = picks[fight.id];
          const isOpen = expanded[fight.id];
          return (
            <View key={fight.id} style={styles.rowCard}>
              {/* Compact header row (also the expand/collapse toggle) */}
              <View style={styles.row}>
                <Pressable
                  style={styles.rowFighter}
                  onPress={() => setPick(fight.id, fight.a.id)}
                >
                  <Avatar initials={fight.a.initials} selected={picked === fight.a.id} size={40} />
                  <Text
                    style={[styles.rowName, picked === fight.a.id && styles.rowNamePicked]}
                  >
                    {fight.a.name}
                  </Text>
                </Pressable>

                <Pressable style={styles.rowCenter} onPress={() => toggle(fight.id)}>
                  <Text style={styles.rowDivision}>{fight.division}</Text>
                  {picked ? (
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.red} />
                  ) : (
                    <Text style={styles.vsSmall}>VS</Text>
                  )}
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#666"
                  />
                </Pressable>

                <Pressable
                  style={[styles.rowFighter, { justifyContent: "flex-end" }]}
                  onPress={() => setPick(fight.id, fight.b.id)}
                >
                  <Text
                    style={[
                      styles.rowName,
                      { textAlign: "right" },
                      picked === fight.b.id && styles.rowNamePicked,
                    ]}
                  >
                    {fight.b.name}
                  </Text>
                  <Avatar initials={fight.b.initials} selected={picked === fight.b.id} size={40} />
                </Pressable>
              </View>

              {/* Expanded controls */}
              {isOpen && (
                <View style={styles.rowBody}>
                  <FightControls
                    method={methods[fight.id]}
                    round={rounds[fight.id]}
                    proof={fight.proof}
                    onMethod={(m) => setMethod(fight.id, m)}
                    onRound={(r) => setRound(fight.id, r)}
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom bar: lock button stacked above the tab nav, in normal flow */}
      <View style={styles.bottomBar}>
        <View style={styles.lockWrap}>
          <Pressable style={styles.lockBtn}>
            <Ionicons name="lock-closed" size={18} color="#fff" />
            <Text style={styles.lockText}>LOCK IN PICKS</Text>
            <Text style={styles.lockCount}>
              {madePicks}/{totalFights}
            </Text>
          </Pressable>
        </View>
        <View style={{ paddingBottom: insets.bottom }}>
          <BottomNav active="picks" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  eventTitle: {
    fontFamily: "BebasNeue",
    fontSize: 46,
    color: "#fff",
    letterSpacing: 1,
  },
  eventSub: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: -2,
    marginBottom: 22,
  },

  mainCard: {
    backgroundColor: "#111111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#222224",
    marginBottom: 16,
    overflow: "hidden",
  },
  mainHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#161616",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  mainHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#888",
  },

  fighterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 8,
  },
  fighterCol: { alignItems: "center", flex: 1 },
  fighterName: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: 1,
    marginTop: 12,
  },
  vs: { color: "#555", fontWeight: "700", fontSize: 16, paddingHorizontal: 8 },

  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#666",
    marginTop: 18,
    marginBottom: 10,
  },
  segRow: { flexDirection: "row", gap: 10 },
  seg: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#262626",
    alignItems: "center",
  },
  roundBox: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  segActive: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  segText: { color: "#aaa", fontWeight: "700", fontSize: 15, letterSpacing: 1 },
  segTextActive: { color: "#fff" },

  proof: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    backgroundColor: "#161616",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 14,
  },
  proofAvatars: { flexDirection: "row" },
  proofDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#161616",
  },
  proofText: { color: "#ccc", fontSize: 13, flex: 1 },

  rowCard: {
    backgroundColor: "#111111",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#222224",
    padding: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowFighter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowName: { color: "#fff", fontWeight: "700", fontSize: 14, letterSpacing: 0.5, flexShrink: 1 },
  rowNamePicked: { color: COLORS.red },
  rowCenter: { alignItems: "center", justifyContent: "center", width: 84, gap: 3 },
  rowDivision: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#666",
  },
  vsSmall: { color: "#555", fontWeight: "700", fontSize: 12 },
  rowBody: {
    marginTop: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#222224",
  },

  bottomBar: {
    paddingTop: 10,
    backgroundColor: "#0d0d0d",
    borderTopColor: "#222224",
    borderTopWidth: 1,
  },
  lockWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomColor: "#1a1a1a",
    borderBottomWidth: 1,
  },
  lockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.red,
    borderRadius: 12,
    paddingVertical: 16,
  },
  lockText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: 1.5 },
  lockCount: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 4,
  },
});
