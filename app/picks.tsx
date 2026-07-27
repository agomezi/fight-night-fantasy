import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import { COLORS } from "../constants/colors";
import { commonStyles } from "../styles/common";
import { styles } from "../styles/picks";

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

const EVENT_START = new Date(Date.now() + (3 * 24 + 14) * 60 * 60 * 1000);
const LOCK_LEAD_MS = 10 * 60 * 1000;

function canEditPicks(now: Date = new Date()) {
  return now.getTime() < EVENT_START.getTime() - LOCK_LEAD_MS;
}

function countdownLabel(now: Date = new Date()) {
  let ms = EVENT_START.getTime() - now.getTime();
  if (ms <= 0) return "Live now";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type PickMap = Record<string, string>;
type MethodMap = Record<string, string>;
type RoundMap = Record<string, number>;

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
  const { fighter } = useLocalSearchParams<{ fighter?: string }>();
  const [picks, setPicks] = useState<PickMap>(
    fighter ? { [MAIN_EVENT.id]: fighter } : {}
  );
  const [methods, setMethods] = useState<MethodMap>({});
  const [rounds, setRounds] = useState<RoundMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ main: true });
  const [lockedIn, setLockedIn] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);

  const setPick = (fightId: string, fighterId: string) => {
    if (lockedIn) return;
    setPicks((p) => ({ ...p, [fightId]: fighterId }));
    setExpanded((p) => ({ ...p, [fightId]: true }));
  };
  const setMethod = (fightId: string, m: string) => {
    if (lockedIn) return;
    setMethods((p) => {
      if (p[fightId] === m) {
        const { [fightId]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [fightId]: m };
    });
  };
  const setRound = (fightId: string, r: number) => {
    if (lockedIn) return;
    setRounds((p) => {
      if (p[fightId] === r) {
        const { [fightId]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [fightId]: r };
    });
  };
  const toggle = (fightId: string) =>
    setExpanded((p) => ({ ...p, [fightId]: !p[fightId] }));

  const totalFights = 1 + UNDERCARD.length;
  const madePicks = useMemo(() => Object.keys(picks).length, [picks]);

  const allFights = useMemo(() => [MAIN_EVENT, ...UNDERCARD], []);

  const summary = useMemo(
    () =>
      allFights
        .filter((f) => picks[f.id])
        .map((f) => {
          const winner = picks[f.id] === f.a.id ? f.a : f.b;
          const loser = picks[f.id] === f.a.id ? f.b : f.a;
          const method = methods[f.id];
          const round = rounds[f.id];
          const detail =
            method && method !== "DEC" && round
              ? `${method === "KO/TKO" ? "KO" : "Sub"} · Round ${round}`
              : method === "DEC"
                ? "Decision"
                : undefined;
          return {
            id: f.id,
            winner: titleCase(winner.name),
            loser: titleCase(loser.name),
            detail,
          };
        }),
    [allFights, picks, methods, rounds]
  );

  const shakeX = useRef(new Animated.Value(0)).current;
  const shake = () => {
    shakeX.setValue(0);
    Animated.sequence(
      [10, -10, 8, -8, 5, -5, 0].map((to) =>
        Animated.timing(shakeX, { toValue: to, duration: 50, useNativeDriver: true })
      )
    ).start();
  };

  const lockIn = () => {
    if (madePicks < totalFights) {
      shake();
      return;
    }
    setLockedIn(true);
    setShowLockedModal(true);
  };

  const changePicks = () => {
    if (!canEditPicks()) return;
    setLockedIn(false);
    setShowLockedModal(false);
  };

  const shareCard = () => {
    const lines = summary
      .map((s) => `${s.winner} def. ${s.loser}${s.detail ? ` (${s.detail})` : ""}`)
      .join("\n");
    Share.share({ message: `My UFC 300 picks 🥊\n\n${lines}` }).catch(() => {});
  };

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

        <Text style={styles.eventTitle}>UFC 300</Text>
        <Text style={styles.eventSub}>Make your picks. Lock them in.</Text>

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

        {UNDERCARD.map((fight) => {
          const picked = picks[fight.id];
          const isOpen = expanded[fight.id];
          return (
            <View key={fight.id} style={styles.rowCard}>
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

      <View style={styles.bottomBar}>
        <View style={styles.lockWrap}>
          {lockedIn ? (
            <View style={styles.lockedRow}>
              <View style={styles.lockedPill}>
                <Ionicons name="lock-closed" size={16} color={COLORS.red} />
                <Text style={styles.lockedPillText}>PICKS LOCKED</Text>
              </View>
              {canEditPicks() && (
                <Pressable style={styles.changeBtn} onPress={changePicks}>
                  <Text style={styles.changeBtnText}>CHANGE PICKS</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
              <Pressable
                style={[styles.lockBtn, madePicks < totalFights && styles.lockBtnDisabled]}
                onPress={lockIn}
              >
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.lockText}>LOCK IN PICKS</Text>
                <Text style={styles.lockCount}>
                  {madePicks}/{totalFights}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
        <View style={{ paddingBottom: insets.bottom }}>
          <BottomNav active="picks" />
        </View>
      </View>

      <Modal
        visible={showLockedModal}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowLockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setShowLockedModal(false)}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color="#888" />
            </Pressable>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.badgeWrap}>
                <View style={styles.badge}>
                  <Ionicons name="lock-closed" size={26} color="#fff" />
                </View>
                <View style={styles.badgeCheck}>
                  <Ionicons name="checkmark" size={12} color="#0A0A0A" />
                </View>
              </View>

              <Text style={styles.modalTitle}>LOCKED IN</Text>
              <Text style={styles.modalSub}>Your picks for UFC 300 are locked.</Text>

              <View style={styles.countdownChip}>
                <Ionicons name="time-outline" size={14} color="#ccc" />
                <Text style={styles.countdownText}>
                  Main card starts in {countdownLabel()}
                </Text>
              </View>

              <Text style={styles.groupLabel}>YOUR PICKS</Text>
              <View style={styles.summaryCard}>
                {summary.map((s, i) => (
                  <View
                    key={s.id}
                    style={[styles.summaryRow, i > 0 && styles.summaryRowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryText}>
                        {s.winner} <Text style={styles.summaryDef}>def.</Text> {s.loser}
                      </Text>
                      {s.detail && <Text style={styles.summaryDetail}>{s.detail}</Text>}
                    </View>
                    <Ionicons name="checkmark" size={16} color="#2ecc71" />
                  </View>
                ))}
              </View>

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
                <Text style={styles.proofText}>
                  Vince and 6 others in Fight Night Crew are locked in
                </Text>
              </View>

              <Pressable style={styles.shareBtn} onPress={shareCard}>
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={styles.lockText}>SHARE YOUR CARD</Text>
              </Pressable>
              <Pressable
                style={styles.backBtn}
                onPress={() => setShowLockedModal(false)}
              >
                <Text style={styles.backBtnText}>BACK TO PICKS</Text>
              </Pressable>
              {canEditPicks() && (
                <Pressable style={styles.editLink} onPress={changePicks}>
                  <Text style={styles.editLinkText}>
                    Changed your mind? Edit picks
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
