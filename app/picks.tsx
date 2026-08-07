import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import BottomNav from "../components/BottomNav";
import { NotificationBell, ProfileBadge } from "../components/HeaderIcons";
import AnimatedBar from "../components/AnimatedBar";
import PressableScale from "../components/PressableScale";
import RoundLane, { LanePick } from "../components/RoundLane";
import { appear, popIn } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useToggleProgress } from "../hooks/useToggleProgress";
import { makeCommonStyles } from "../styles/common";
import { makePicksStyles } from "../styles/picks";

type Fighter = { id: string; name: string; initials: string; record: string };
type Fight = {
  id: string;
  division: string;
  /** Scheduled length. Championship and main events go 5. */
  rounds: 3 | 5;
  a: Fighter;
  b: Fighter;
  proof?: string;
};

const MAIN_EVENT: Fight = {
  id: "main",
  division: "LIGHT HEAVYWEIGHT",
  rounds: 5,
  a: { id: "pereira", name: "PEREIRA", initials: "AP", record: "12-2" },
  b: { id: "hill", name: "HILL", initials: "JH", record: "12-1" },
  proof: "Vince and 2 others picked Hill",
};

const UNDERCARD: Fight[] = [
  {
    id: "zhang-yan",
    division: "STRAWWEIGHT",
    rounds: 3,
    a: { id: "zhang", name: "ZHANG", initials: "ZW", record: "24-3" },
    b: { id: "yan", name: "YAN", initials: "XY", record: "17-4" },
    proof: "Vince and 4 others picked Zhang",
  },
  {
    id: "gaethje-holloway",
    division: "LIGHTWEIGHT",
    rounds: 3,
    a: { id: "gaethje", name: "GAETHJE", initials: "JG", record: "25-4" },
    b: { id: "holloway", name: "HOLLOWAY", initials: "MH", record: "26-7" },
    proof: "8 people in your league picked Holloway",
  },
  {
    id: "oliveira-tsarukyan",
    division: "LIGHTWEIGHT",
    rounds: 3,
    a: { id: "oliveira", name: "OLIVEIRA", initials: "CO", record: "34-9" },
    b: { id: "tsarukyan", name: "TSARUKYAN", initials: "AT", record: "21-3" },
    proof: "Split 50/50 in your league",
  },
];


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

function Avatar({
  initials,
  selected,
  size = 96,
}: {
  initials: string;
  selected?: boolean;
  size?: number;
}) {
  const { c } = useTheme();
  const progress = useToggleProgress(!!selected);

  // Border thickens and warms to red while the tile swells slightly, so
  // picking a fighter reads as a commitment rather than a colour swap.
  const animatedStyle = useAnimatedStyle(() => ({
    borderWidth: 1 + progress.value,
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [c.borderStrong, c.red],
    ),
    transform: [{ scale: 1 + progress.value * 0.05 }],
  }));

  const badgeSize = Math.max(18, size / 4);

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 14,
          backgroundColor: c.input,
          alignItems: "center",
          justifyContent: "center",
        },
        animatedStyle,
      ]}
    >
      <Text style={{ color: c.text, fontWeight: "700", fontSize: size / 3 }}>
        {initials}
      </Text>

      {selected && (
        <Animated.View
          entering={popIn}
          exiting={ZoomOut.duration(120)}
          style={{
            position: "absolute",
            top: -badgeSize / 3,
            right: -badgeSize / 3,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: c.red,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="checkmark" size={badgeSize * 0.7} color="#FFFFFF" />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Disclosure arrow that rotates between open and closed. */
function Chevron({ open, size = 18 }: { open: boolean; size?: number }) {
  const { c } = useTheme();
  const progress = useToggleProgress(open);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={size} color={c.textMuted} />
    </Animated.View>
  );
}


export default function Picks() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makePicksStyles);
  const { fighter } = useLocalSearchParams<{ fighter?: string }>();
  const [picks, setPicks] = useState<PickMap>(
    fighter ? { [MAIN_EVENT.id]: fighter } : {}
  );
  // One lane pick per fight replaces the old picks/methods/rounds triple —
  // winner, method and round are a single decision now.
  const [lane, setLane] = useState<Record<string, LanePick>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ main: true });
  const [lockedIn, setLockedIn] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);

  const setLanePick = (fight: Fight, next: LanePick | null) => {
    if (lockedIn) return;
    setLane((p) => {
      if (!next) {
        const { [fight.id]: _drop, ...rest } = p;
        return rest;
      }
      return { ...p, [fight.id]: next };
    });
    // Keep the legacy winner map in step so the summary and counter work.
    setPicks((p) => {
      if (!next) {
        const { [fight.id]: _drop, ...rest } = p;
        return rest;
      }
      return { ...p, [fight.id]: next.corner === "red" ? fight.a.id : fight.b.id };
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
          const lp = lane[f.id];
          const detail = !lp
            ? undefined
            : lp.finish === "DEC"
              ? "Decision"
              : `${lp.method === "KO" ? "KO/TKO" : "Sub"} · Round ${lp.finish}`;
          return {
            id: f.id,
            winner: titleCase(winner.name),
            loser: titleCase(loser.name),
            detail,
          };
        }),
    [allFights, picks, lane]
  );

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const shake = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {},
      );
    }
    shakeX.value = withSequence(
      ...[10, -10, 8, -8, 5, -5, 0].map((to) =>
        withTiming(to, { duration: 50 }),
      ),
    );
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
      style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ProfileBadge />
          <Text style={commonStyles.headerLogo}>Fight Night</Text>
          <NotificationBell />
        </View>
        <View style={commonStyles.divider} />

        <Text style={styles.eventTitle}>UFC 300</Text>
        <Text style={styles.eventSub}>Make your picks. Lock them in.</Text>

        <Animated.View
          entering={appear(0)}
          layout={LinearTransition.duration(220)}
          style={styles.mainCard}
        >
          <PressableScale style={styles.mainHeader} onPress={() => toggle(MAIN_EVENT.id)}>
            <Text style={styles.mainHeaderText}>
              MAIN EVENT{"  "}
              <Text style={{ color: c.red }}>{MAIN_EVENT.division}</Text>
            </Text>
            <Chevron open={!!expanded[MAIN_EVENT.id]} />
          </PressableScale>

          {expanded[MAIN_EVENT.id] && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={{ padding: 18, paddingTop: 4 }}
            >
              <RoundLane
                rounds={MAIN_EVENT.rounds}
                red={{ name: titleCase(MAIN_EVENT.a.name), record: MAIN_EVENT.a.record }}
                blue={{ name: titleCase(MAIN_EVENT.b.name), record: MAIN_EVENT.b.record }}
                pick={lane[MAIN_EVENT.id]}
                onPick={(next) => setLanePick(MAIN_EVENT, next)}
                disabled={lockedIn}
              />
              {MAIN_EVENT.proof && (
                <Text style={styles.proofText}>{MAIN_EVENT.proof}</Text>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {UNDERCARD.map((fight, i) => {
          const picked = picks[fight.id];
          const isOpen = expanded[fight.id];
          return (
            <Animated.View
              key={fight.id}
              entering={appear(i + 1)}
              layout={LinearTransition.duration(220)}
              style={styles.rowCard}
            >
              {/* Collapsed row is a readout; all picking happens in the lane. */}
              <PressableScale style={styles.row} onPress={() => toggle(fight.id)}>
                <View style={styles.rowFighter}>
                  <Avatar initials={fight.a.initials} selected={picked === fight.a.id} size={36} />
                  <Text
                    style={[styles.rowName, picked === fight.a.id && styles.rowNamePicked]}
                    numberOfLines={1}
                  >
                    {fight.a.name}
                  </Text>
                </View>

                <View style={styles.rowCenter}>
                  <Text style={styles.rowDivision}>{fight.division}</Text>
                  {picked ? (
                    <Animated.View entering={popIn}>
                      <Ionicons name="checkmark-circle" size={16} color={c.red} />
                    </Animated.View>
                  ) : (
                    <Animated.Text entering={FadeIn.duration(160)} style={styles.vsSmall}>
                      VS
                    </Animated.Text>
                  )}
                  <Chevron open={!!isOpen} size={14} />
                </View>

                <View style={[styles.rowFighter, { justifyContent: "flex-end" }]}>
                  <Text
                    style={[
                      styles.rowName,
                      { textAlign: "right" },
                      picked === fight.b.id && styles.rowNamePicked,
                    ]}
                    numberOfLines={1}
                  >
                    {fight.b.name}
                  </Text>
                  <Avatar initials={fight.b.initials} selected={picked === fight.b.id} size={36} />
                </View>
              </PressableScale>

              {isOpen && (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(120)}
                  style={styles.rowBody}
                >
                  <RoundLane
                    rounds={fight.rounds}
                    red={{ name: titleCase(fight.a.name), record: fight.a.record }}
                    blue={{ name: titleCase(fight.b.name), record: fight.b.record }}
                    pick={lane[fight.id]}
                    onPick={(next) => setLanePick(fight, next)}
                    disabled={lockedIn}
                  />
                  {fight.proof && <Text style={styles.proofText}>{fight.proof}</Text>}
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.lockWrap}>
          {lockedIn ? (
            <View style={styles.lockedRow}>
              <View style={styles.lockedPill}>
                <Ionicons name="lock-closed" size={16} color={c.red} />
                <Text style={styles.lockedPillText}>PICKS LOCKED</Text>
              </View>
              {canEditPicks() && (
                <PressableScale style={styles.changeBtn} onPress={changePicks}>
                  <Text style={styles.changeBtnText}>CHANGE PICKS</Text>
                </PressableScale>
              )}
            </View>
          ) : (
            <Animated.View style={shakeStyle}>
              {/* Fills as picks are made, so how close you are to locking in
                  is readable without doing the arithmetic yourself. */}
              <AnimatedBar
                percent={totalFights ? (madePicks / totalFights) * 100 : 0}
                height={3}
                delay={0}
                style={{ marginBottom: 10 }}
              />
              <PressableScale
                style={[styles.lockBtn, madePicks < totalFights && styles.lockBtnDisabled]}
                onPress={lockIn}
              >
                <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                <Text style={styles.lockText}>LOCK IN PICKS</Text>
                <Text style={styles.lockCount}>
                  {madePicks}/{totalFights}
                </Text>
              </PressableScale>
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
          <Animated.View entering={popIn} style={styles.modalCard}>
            <PressableScale
              style={styles.modalClose}
              onPress={() => setShowLockedModal(false)}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color={c.textMuted} />
            </PressableScale>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.badgeWrap}>
                <View style={styles.badge}>
                  <Ionicons name="lock-closed" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.badgeCheck}>
                  <Ionicons name="checkmark" size={12} color="#0A0A0A" />
                </View>
              </View>

              <Text style={styles.modalTitle}>LOCKED IN</Text>
              <Text style={styles.modalSub}>Your picks for UFC 300 are locked.</Text>

              <View style={styles.countdownChip}>
                <Ionicons name="time-outline" size={14} color={c.text2} />
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
                    <Ionicons name="checkmark" size={16} color={c.green} />
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

              <PressableScale style={styles.shareBtn} onPress={shareCard}>
                <Ionicons name="share-social" size={18} color="#FFFFFF" />
                <Text style={styles.lockText}>SHARE YOUR CARD</Text>
              </PressableScale>
              <PressableScale
                style={styles.backBtn}
                onPress={() => setShowLockedModal(false)}
              >
                <Text style={styles.backBtnText}>BACK TO PICKS</Text>
              </PressableScale>
              {canEditPicks() && (
                <PressableScale style={styles.editLink} onPress={changePicks}>
                  <Text style={styles.editLinkText}>
                    Changed your mind? Edit picks
                  </Text>
                </PressableScale>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
