import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import HeaderBar from "../components/HeaderBar";
import AnimatedBar from "../components/AnimatedBar";
import PressableScale from "../components/PressableScale";
import RoundLane, { LanePick } from "../components/RoundLane";
import Skeleton from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import FighterPhoto from "../components/FighterPhoto";
import { LEAGUE } from "../constants/league";
import { useAuth } from "../context/AuthContext";
import { useNextEvent } from "../hooks/useNextEvent";
import { divisionLabel, initials, lastName, lockLabel, nextLock, splitEventName, startLabel, type CardSegment, type EventBout } from "../services/events";
import { loadPicks, PicksLockedError, savePicks } from "../services/picks";
import { enablePush } from "../services/push";
import { appear, popIn } from "../constants/motion";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useToggleProgress } from "../hooks/useToggleProgress";
import { makeCommonStyles } from "../styles/common";
import { makePicksStyles } from "../styles/picks";

type Fighter = { id: string; name: string; initials: string; record: string; photoUrl: string | null };
type Fight = {
  id: string;
  division: string;
  /** Scheduled length. Championship and main events go 5. */
  rounds: 3 | 5;
  segment: CardSegment | null;
  locksAt: Date;
  a: Fighter;
  b: Fighter;
  /** League social proof; none until leagues exist. */
  proof?: string;
};

function toFight(bout: EventBout): Fight {
  const fighter = (f: EventBout["red"]): Fighter => ({
    id: f.id,
    name: lastName(f.name).toUpperCase(),
    initials: initials(f.name),
    // The record, or the nickname until card sync has one.
    record: f.record ?? f.nickname ?? "",
    photoUrl: f.photoUrl,
  });
  return {
    id: bout.id,
    division: divisionLabel(bout.weightClass),
    rounds: bout.scheduledRounds === 5 ? 5 : 3,
    segment: bout.segment,
    locksAt: bout.locksAt,
    a: fighter(bout.red),
    b: fighter(bout.blue),
  };
}

const SEGMENT_LABELS: Record<CardSegment, string> = {
  main: "MAIN CARD",
  prelims: "PRELIMS",
  early_prelims: "EARLY PRELIMS",
};

function countdownLabel(target: Date, now: Date) {
  const ms = target.getTime() - now.getTime();
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

function Avatar({
  initials,
  photoUrl,
  selected,
  size = 96,
}: {
  initials: string;
  photoUrl?: string | null;
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
      <FighterPhoto
        uri={photoUrl}
        initials={initials}
        radius={14}
        textStyle={{ color: c.text, fontWeight: "700", fontSize: size / 3 }}
      />

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

/** The card's shape while it loads: title, the open main event, then rows. */
function CardSkeleton() {
  const styles = useThemedStyles(makePicksStyles);
  return (
    <View>
      <Skeleton width="45%" height={40} radius={8} style={{ marginBottom: 10 }} />
      <Skeleton width="60%" height={13} style={{ marginBottom: 22 }} />
      <View style={styles.mainCard}>
        <View style={styles.mainHeader}>
          <Skeleton width="50%" height={12} />
        </View>
        <View style={{ padding: 18, gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Skeleton width="40%" height={44} radius={10} />
            <Skeleton width="40%" height={44} radius={10} />
          </View>
          <Skeleton height={36} radius={8} />
        </View>
      </View>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.rowCard}>
          <View style={styles.row}>
            <View style={styles.rowFighter}>
              <Skeleton width={36} height={36} radius={10} />
              <Skeleton width="45%" height={13} />
            </View>
            <Skeleton width={56} height={10} />
            <View style={[styles.rowFighter, { justifyContent: "flex-end" }]}>
              <Skeleton width="45%" height={13} />
              <Skeleton width={36} height={36} radius={10} />
            </View>
          </View>
        </View>
      ))}
    </View>
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
  const { session } = useAuth();
  const next = useNextEvent();
  const event = next.status === "ready" ? next.event : null;
  const eventName = event ? splitEventName(event.name) : null;
  const allFights = useMemo(() => (event ? event.bouts.map(toFight) : []), [event]);
  const MAIN_EVENT = allFights[0] as Fight | undefined;
  const UNDERCARD = allFights.slice(1);
  // The server decides; this only mirrors it so the screen stops offering edits.
  // Each part of the card locks when it starts, so the card stays editable
  // until its last section, the main card, begins.
  const isLocked = (fight: { locksAt: Date }) => fight.locksAt.getTime() <= next.now.getTime();
  const canEditPicks = !!event && event.bouts.some((b) => !isLocked(b));
  const upcomingLock = event ? nextLock(event.bouts, next.now) : null;

  // One lane pick per bout — winner, method and round are a single decision.
  const [lane, setLane] = useState<Record<string, LanePick>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lockedIn, setLockedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);

  // Load what this user already saved for the card. Quick Pick on home hands
  // off a fighter id: it seeds the main event, or switches a saved main event
  // pick to that fighter, keeping the method and round already called.
  const eventId = event?.id;
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    const main = event.bouts[0];
    setExpanded(main ? { [main.id]: true } : {});
    loadPicks(event.bouts)
      .then((saved) => {
        if (cancelled) return;
        const seeded = { ...saved };
        const corner = main && fighter ? (fighter === main.red.id ? "red" : fighter === main.blue.id ? "blue" : null) : null;
        const switched = !!main && !!corner && canEditPicks && seeded[main.id]?.corner !== corner;
        if (main && corner && switched) {
          seeded[main.id] = seeded[main.id] ? { ...seeded[main.id], corner } : { corner, finish: "ANY" };
        }
        setLane(seeded);
        // A saved card opens locked in. One missing its main event (a fighter
        // replaced since) opens for editing, since that pick has to be redone,
        // and so does one just switched on home, so it can be saved.
        setLockedIn(!!main && !!saved[main.id] && !switched);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Reload only when the card itself changes, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, fighter]);

  // Winner per bout, for the counter, the rows and the summary.
  const picks = useMemo(() => {
    const winners: Record<string, string> = {};
    for (const f of allFights) {
      const lp = lane[f.id];
      if (lp) winners[f.id] = lp.corner === "red" ? f.a.id : f.b.id;
    }
    return winners;
  }, [allFights, lane]);

  const setLanePick = (fight: Fight, next: LanePick | null) => {
    if (lockedIn || isLocked(fight)) return;
    setLane((p) => {
      if (!next) {
        const { [fight.id]: _drop, ...rest } = p;
        return rest;
      }
      return { ...p, [fight.id]: next };
    });
  };
  const toggle = (fightId: string) =>
    setExpanded((p) => ({ ...p, [fightId]: !p[fightId] }));

  const totalFights = allFights.length;
  const madePicks = Object.keys(picks).length;
  // Outside a league only the main event is required; the rest of the card is
  // optional. League tiers will set their own minimum here.
  const canLockIn = !!MAIN_EVENT && !!picks[MAIN_EVENT.id];

  const summary = useMemo(
    () =>
      allFights
        .filter((f) => picks[f.id])
        .map((f) => {
          const winner = picks[f.id] === f.a.id ? f.a : f.b;
          const loser = picks[f.id] === f.a.id ? f.b : f.a;
          const lp = lane[f.id];
          const how = lp?.method
            ? lp.method === "KO"
              ? "KO/TKO"
              : "Sub"
            : undefined;
          // Winner-only picks have no detail line; each refinement adds one.
          const detail = !lp
            ? undefined
            : lp.finish === "DEC"
              ? "Decision"
              : lp.finish === "ANY"
                ? how
                : how
                  ? `${how} · Round ${lp.finish}`
                  : `Round ${lp.finish}`;
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

  const lockIn = async () => {
    if (!event || !session || saving) return;
    if (!canLockIn) {
      shake();
      return;
    }
    setSaving(true);
    try {
      await savePicks(session.user.id, event.bouts, lane);
      setLockedIn(true);
      setShowLockedModal(true);
      // The moment notifications make sense: picks are in and there is a card
      // to hear about. Only asks the first time.
      enablePush(true);
    } catch (e) {
      shake();
      Alert.alert(
        e instanceof PicksLockedError ? "Picks are locked" : "Couldn't save your picks",
        e instanceof PicksLockedError
          ? "This card has started, so picks can no longer change."
          : "Check your connection and try again.",
      );
      if (e instanceof PicksLockedError) next.reload();
    } finally {
      setSaving(false);
    }
  };

  const changePicks = () => {
    if (!canEditPicks) return;
    setLockedIn(false);
    setShowLockedModal(false);
  };

  const shareCard = () => {
    const lines = summary
      .map((s) => `${s.winner} def. ${s.loser}${s.detail ? ` (${s.detail})` : ""}`)
      .join("\n");
    Share.share({ message: `My ${eventName?.title ?? "UFC"} picks 🥊\n\n${lines}` }).catch(() => {});
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
        <HeaderBar />

        {next.status === "loading" ? (
          <CardSkeleton />
        ) : (
          <Text style={styles.eventTitle}>
            {eventName?.title ?? "Picks"}
          </Text>
        )}
        {next.status !== "loading" && (
          <Text style={styles.eventSub}>
            {!event
              ? " "
              : !canEditPicks
                ? `${eventName?.headline ?? "This card"} · picks are locked`
                : upcomingLock && event.bouts.some((b) => isLocked(b))
                  ? `${eventName?.headline ?? "This card"} · the rest locks in ${lockLabel(upcomingLock, next.now).toLowerCase()}`
                  : `${eventName?.headline ?? "Make your picks"}. Lock them in.`}
          </Text>
        )}

        {next.status !== "loading" && !MAIN_EVENT && (
          <EmptyState
            icon="calendar-outline"
            title={next.status === "error" ? "Couldn't load the card" : "No card yet"}
            message={
              next.status === "error"
                ? "Check your connection, then come back to this screen."
                : "Picks open as soon as the next card is announced."
            }
          />
        )}

        {MAIN_EVENT && (
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
                  onPick={(pick) => setLanePick(MAIN_EVENT, pick)}
                  disabled={lockedIn || isLocked(MAIN_EVENT)}
                />
                {/* Social proof is about your league. With no league there is
                    nobody to compare against, so the line is dropped rather
                    than invented. */}
                {LEAGUE && MAIN_EVENT.proof && (
                  <Text style={styles.proofText}>{MAIN_EVENT.proof}</Text>
                )}
              </Animated.View>
            )}
          </Animated.View>
        )}

        {UNDERCARD.map((fight, i) => {
          const picked = picks[fight.id];
          const isOpen = expanded[fight.id];
          // Label each part of the card where it starts. The main event sits
          // above, so the first label is for the rest of the main card.
          const prev = i === 0 ? MAIN_EVENT : UNDERCARD[i - 1];
          const label = fight.segment && fight.segment !== prev?.segment
            ? SEGMENT_LABELS[fight.segment]
            : i === 0 && fight.segment === "main"
              ? SEGMENT_LABELS.main
              : null;
          return (
            <View key={fight.id}>
              {label && (
                <Text style={[styles.groupLabel, { marginTop: 14 }]}>
                  {label}
                  {isLocked(fight) ? (
                    <Text style={{ color: c.red }}>  · LOCKED</Text>
                  ) : (
                    `  · LOCKS ${startLabel(fight.locksAt).split(" · ")[1]}`
                  )}
                </Text>
              )}
              <Animated.View
                entering={appear(Math.min(i + 1, 6))}
                layout={LinearTransition.duration(220)}
                style={styles.rowCard}
              >
                {/* Collapsed row is a readout; all picking happens in the lane.
                    The division has its own line, so a long name can't push it. */}
                <PressableScale onPress={() => toggle(fight.id)}>
                {!!fight.division && (
                  <Text style={styles.rowDivision} numberOfLines={1}>
                    {fight.division}
                  </Text>
                )}
                <View style={styles.row}>
                  <View style={styles.rowFighter}>
                    <Avatar initials={fight.a.initials} photoUrl={fight.a.photoUrl} selected={picked === fight.a.id} size={36} />
                    <View style={{ flexShrink: 1 }}>
                      <Text
                        style={[styles.rowName, picked === fight.a.id && styles.rowNamePicked]}
                        numberOfLines={1}
                      >
                        {fight.a.name}
                      </Text>
                      {!!fight.a.record && (
                        <Text style={styles.rowRecord} numberOfLines={1}>
                          {fight.a.record}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.rowCenter}>
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
                    <View style={{ flexShrink: 1, alignItems: "flex-end" }}>
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
                      {!!fight.b.record && (
                        <Text style={[styles.rowRecord, { textAlign: "right" }]} numberOfLines={1}>
                          {fight.b.record}
                        </Text>
                      )}
                    </View>
                    <Avatar initials={fight.b.initials} photoUrl={fight.b.photoUrl} selected={picked === fight.b.id} size={36} />
                  </View>
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
                      onPick={(pick) => setLanePick(fight, pick)}
                      disabled={lockedIn || isLocked(fight)}
                    />
                    {LEAGUE && fight.proof && (
                      <Text style={styles.proofText}>{fight.proof}</Text>
                    )}
                  </Animated.View>
                )}
            </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.lockWrap}>
          {!event ? null : lockedIn || !canEditPicks ? (
            <View style={styles.lockedRow}>
              <View style={styles.lockedPill}>
                <Ionicons name="lock-closed" size={16} color={c.red} />
                <Text style={styles.lockedPillText}>
                  {lockedIn ? "PICKS LOCKED" : "CARD LOCKED"}
                </Text>
              </View>
              {canEditPicks && (
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
                style={[styles.lockBtn, (!canLockIn || saving) && styles.lockBtnDisabled]}
                onPress={lockIn}
              >
                <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                <Text style={styles.lockText}>{saving ? "SAVING…" : "LOCK IN PICKS"}</Text>
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
              <Text style={styles.modalSub}>
                Your picks for {eventName?.title ?? "this card"} are saved. You can change them until the card starts.
              </Text>

              <View style={styles.countdownChip}>
                <Ionicons name="time-outline" size={14} color={c.text2} />
                <Text style={styles.countdownText}>
                  Card starts in {event ? countdownLabel(event.startsAt, next.now) : "—"}
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

              {LEAGUE ? (
                <View style={styles.proof}>
                  <View style={styles.proofAvatars}>
                    {["#E8A020", "#9B59B6", "#3a7bd5"].map((dot, i) => (
                      <View
                        key={dot}
                        style={[
                          styles.proofDot,
                          { backgroundColor: dot, marginLeft: i === 0 ? 0 : -8 },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.proofText}>
                    Vince and 6 others in {LEAGUE.name} are locked in
                  </Text>
                </View>
              ) : (
                /* Nobody to be locked in alongside yet — so the line points
                   at what would change that. */
                <View style={styles.proof}>
                  <Text style={styles.proofText}>
                    Join a league and you can watch this card against friends
                  </Text>
                </View>
              )}

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
              {canEditPicks && (
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
