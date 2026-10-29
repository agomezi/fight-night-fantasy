import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProfile } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { cleanHandle, HandleBlockedError, handleProblem, handleStatus, HandleTakenError, HANDLE_MAX } from "../services/profile";
import { DIVISIONS } from "../constants/divisions";
import { RANKS } from "../services/career";
import { DEDUCTIONS, POINTS, UNDERDOG_MULTIPLIER } from "../services/scoring";
import { CAP, CAP_TOP, GUTTER, LEFT_BEARING, makeLoginStyles } from "../styles/login";

/*
 * First run: a short tour of how the game works, then a favorite division
 * (optional) and a name. Same poster
 * language as the login screen — Anton headlines stacked tight, the red band
 * behind the last line, ruled rows instead of cards, one big button.
 *
 * The tour can be skipped; the name cannot, because leaderboards need one.
 */

type Row = { label: string; value: string; note?: string };
type Slide = { eyebrow: string; lines: [string, string]; body: string; rows: Row[] };

const SLIDES: Slide[] = [
  {
    eyebrow: "HOW IT WORKS",
    lines: ["CALL THE", "FIGHT"],
    body: "Pick who wins every bout on the card. Want more points? Call how it ends and in which round.",
    rows: [
      { label: "Winner", value: "PEREIRA" },
      { label: "Method", value: "KO/TKO" },
      { label: "Round", value: "R2" },
    ],
  },
  {
    eyebrow: "SCORING",
    lines: ["EVERY CALL", "COUNTS"],
    body: "Right calls earn, wrong calls cost. You're only judged on what you called — skip the method or round and it can't hurt you.",
    rows: [
      { label: "Fighter", value: `+${POINTS.fighter}`, note: `−${DEDUCTIONS.fighter}` },
      { label: "Method", value: `+${POINTS.method}`, note: `−${DEDUCTIONS.method}` },
      { label: "Round", value: `+${POINTS.round}`, note: `−${DEDUCTIONS.round}` },
      { label: "Main card underdog", value: `${UNDERDOG_MULTIPLIER}x` },
    ],
  },
  {
    eyebrow: "FIGHT NIGHT",
    lines: ["LOCK IT", "IN"],
    body: "Each part of the card locks when it starts: early prelims, prelims, then the main card. Results land minutes after each fight, and scores settle once they're official.",
    rows: [
      { label: "Section starts", value: "LOCKED" },
      { label: "Fight ends", value: "LIVE" },
      { label: "Official", value: "FINAL" },
    ],
  },
  {
    eyebrow: "LEAGUES",
    lines: ["BRING YOUR", "CREW"],
    body: "Start a private league with friends and face a new member every card. The owner sets the minimum picks; miss it and you forfeit the week.",
    rows: [
      { label: "League size", value: "4–12" },
      { label: "Tiers", value: "CASUAL · AMATEUR · PRO" },
      { label: "Every card", value: "NEW OPPONENT" },
      { label: "Minimum picks", value: "SET BY THE OWNER" },
    ],
  },
  {
    eyebrow: "LEADERBOARDS",
    lines: ["CLIMB THE", "RANKS"],
    body: "Global ranks you by edge: points above the average player on the same fights. A card counts once you pick the whole main card.",
    rows: [
      { label: "Season", value: "11 CARDS" },
      { label: "Ranked by", value: "EDGE" },
      { label: "Counts when", value: "MAIN CARD PICKED" },
    ],
  },
  {
    eyebrow: "YOUR CAREER",
    lines: ["BUILD A", "CAREER"],
    body: "Every card is a fight on your pro record. Finish in the top half and it's a W. Your record never resets, and every card moves you up the ranks.",
    rows: [
      { label: "Pro record", value: "TOP HALF = W" },
      { label: "Career points", value: "1 A CARD + 1 A WIN" },
      { label: RANKS[1].rank, value: `${RANKS[1].at} PTS` },
      { label: RANKS[RANKS.length - 1].rank, value: `${RANKS[RANKS.length - 1].at} PTS` },
    ],
  },
];

// The name goes last: saving it ends onboarding.
const DIVISION_STEP = SLIDES.length;
const NAME_STEP = SLIDES.length + 1;
const STEPS = SLIDES.length + 2;

/** Two Anton lines set tight like the login title, red band behind the second. */
function Headline({ lines, size, ink, red }: { lines: [string, string]; size: number; ink: string; red: string }) {
  const line = { height: size * CAP, overflow: "visible" as const };
  const text = { fontFamily: "Anton", fontSize: size, color: ink, marginTop: -size * CAP_TOP, marginLeft: -size * LEFT_BEARING };
  return (
    <View accessibilityRole="header" accessibilityLabel={lines.join(" ")}>
      <View style={line}>
        <Text style={text} numberOfLines={1}>{lines[0]}</Text>
      </View>
      <View style={{ height: size * 0.06 }} />
      <View style={[line, { alignSelf: "flex-start" }]}>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: -size * 0.08,
            top: size * CAP * 0.7,
            height: size * CAP * 0.39,
            backgroundColor: red,
          }}
        />
        <Text style={text} numberOfLines={1}>{lines[1]}</Text>
      </View>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const { c } = useTheme();
  const styles = useThemedStyles(makeLoginStyles);
  const { width } = useWindowDimensions();
  const { profile, setUsername, updateProfile } = useProfile();
  const list = useRef<FlatList<number>>(null);
  const [step, setStep] = useState(0);

  const ink = styles.heading.color as string;
  const muted = styles.footnote.color as string;
  const rule = c.statusBar === "light" ? "#2A2A2A" : "#D9D5CD";
  // Sized so the longest headline line ("BRING YOUR") fits the screen.
  const headlineSize = Math.min(72, (width - GUTTER * 2) / 4.3);

  // --- division -------------------------------------------------------------
  // Optional; tapping the chosen one again clears it.
  const [division, setDivision] = useState("");

  // --- name -----------------------------------------------------------------
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "free" | "taken" | "blocked" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const problem = name ? handleProblem(name) : null;

  useEffect(() => {
    if (!name || handleProblem(name)) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let current = true;
    const timer = setTimeout(() => {
      handleStatus(name)
        .then((status) => current && setAvailability(status === "invalid" ? "idle" : status))
        .catch(() => current && setAvailability("error"));
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [name]);

  const canFinish =
    !!name && !problem && availability !== "taken" && availability !== "blocked" && availability !== "checking" && !saving;

  const finish = async () => {
    if (!canFinish) return;
    setSaving(true);
    try {
      if (division) updateProfile({ favDivision: division, bio: profile.bio });
      await setUsername(name);
      router.replace("/home");
    } catch (e) {
      if (e instanceof HandleTakenError) setAvailability("taken");
      else if (e instanceof HandleBlockedError) setAvailability("blocked");
      else Alert.alert("Couldn't save your name", e instanceof Error ? e.message : "Please try again.");
      setSaving(false);
    }
  };

  // --- paging ---------------------------------------------------------------
  const goTo = (index: number) => {
    list.current?.scrollToIndex({ index, animated: true });
    setStep(index);
  };
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setStep(first.index);
  }).current;

  const hint =
    problem ??
    (availability === "checking"
      ? "Checking…"
      : availability === "taken"
        ? "That name is taken."
        : availability === "blocked"
          ? "That name isn't allowed. Pick another."
          : availability === "free"
          ? "It's yours."
          : availability === "error"
            ? "Couldn't check right now — you can still try."
            : `3–${HANDLE_MAX} letters, numbers or underscores. You can change it later.`);
  const refused = !!problem || availability === "taken" || availability === "blocked";
  const hintColor = refused ? c.red : availability === "free" ? c.green : muted;

  const chip = (value: string, label: string) => {
    const on = division === value;
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setDivision(on ? "" : value)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={value}
        style={{
          borderWidth: 1,
          borderColor: on ? c.red : rule,
          backgroundColor: on ? c.red : "transparent",
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Text style={{ color: on ? "#FFFFFF" : ink, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  };
  const groupLabel = (text: string) => (
    <Text style={{ color: muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 22, marginBottom: 10 }}>
      {text}
    </Text>
  );

  const renderSlide = (index: number) => {
    if (index === DIVISION_STEP) {
      return (
        <View style={{ width, paddingHorizontal: GUTTER }}>
          <Headline lines={["YOUR", "DIVISION"]} size={headlineSize} ink={ink} red={c.red} />
          <Text style={[styles.subheading, { marginTop: 22, fontSize: 17, lineHeight: 24 }]}>
            League mates see it on your card. You can change it any time.
          </Text>
          {groupLabel("MEN")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DIVISIONS.men.map((d) => chip(d, d))}
          </View>
          {groupLabel("WOMEN")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DIVISIONS.women.map((d) => chip(d, d.replace("Women's ", "")))}
          </View>
        </View>
      );
    }
    if (index === NAME_STEP) {
      return (
        <View style={{ width, paddingHorizontal: GUTTER }}>
          <Headline lines={["PICK YOUR", "NAME"]} size={headlineSize} ink={ink} red={c.red} />
          <Text style={[styles.subheading, { marginTop: 22, fontSize: 17, lineHeight: 24 }]}>
            It&apos;s how you show up on leaderboards and in your leagues.
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 28,
              borderBottomWidth: 2,
              borderBottomColor: refused ? c.red : ink,
              paddingBottom: 8,
            }}
          >
            <TextInput
              value={name}
              onChangeText={(t) => setName(cleanHandle(t))}
              placeholder="ELITE_STRIKER"
              placeholderTextColor={rule}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              maxLength={HANDLE_MAX}
              returnKeyType="done"
              onSubmitEditing={finish}
              accessibilityLabel="Your name"
              style={{ flex: 1, color: ink, fontFamily: "Anton", fontSize: 34, paddingVertical: 4 }}
            />
            {availability === "checking" && <ActivityIndicator color={muted} />}
            {availability === "free" && !problem && <Ionicons name="checkmark-circle" size={24} color={c.green} />}
            {refused && <Ionicons name="close-circle" size={24} color={c.red} />}
          </View>
          <Text style={{ color: hintColor, fontSize: 14, marginTop: 10 }}>{hint}</Text>
        </View>
      );
    }

    const slide = SLIDES[index];
    return (
      <View style={{ width, paddingHorizontal: GUTTER }}>
        <Headline lines={slide.lines} size={headlineSize} ink={ink} red={c.red} />
        <Text style={[styles.subheading, { marginTop: 22, fontSize: 17, lineHeight: 24 }]}>{slide.body}</Text>
        <View style={{ marginTop: 26 }}>
          {slide.rows.map((row, i) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                paddingVertical: 13,
                borderTopWidth: i === 0 ? 2 : 1,
                borderTopColor: i === 0 ? ink : rule,
              }}
            >
              <Text style={{ color: muted, fontSize: 15 }}>{row.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexShrink: 1 }}>
                {row.note && <Text style={{ color: c.red, fontSize: 15, fontWeight: "700" }}>{row.note}</Text>}
                <Text style={{ color: ink, fontSize: 16, fontWeight: "800", letterSpacing: 0.5, flexShrink: 1 }} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const onName = step === NAME_STEP;
  const buttonDisabled = onName && !canFinish;

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: 0 }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: GUTTER }}>
          <View style={[styles.eyebrow, { justifyContent: "space-between" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.eyebrowMark} />
              <Animated.Text key={step} entering={FadeIn.duration(160)} style={styles.eyebrowText}>
                {onName ? "LAST STEP" : step === DIVISION_STEP ? "SETUP" : SLIDES[step].eyebrow}
              </Animated.Text>
            </View>
            {!onName && (
              // From the tour, Skip goes to setup; from the division, on to the name.
              <TouchableOpacity
                onPress={() => goTo(step < DIVISION_STEP ? DIVISION_STEP : NAME_STEP)}
                hitSlop={12}
                accessibilityRole="button"
              >
                <Text style={{ color: muted, fontSize: 14, fontWeight: "600" }}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* One segment per step, filled up to where you are. */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 18, marginBottom: 30 }}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 3, backgroundColor: i <= step ? c.red : rule }} />
            ))}
          </View>
        </View>

        <FlatList
          ref={list}
          data={Array.from({ length: STEPS }, (_, i) => i)}
          keyExtractor={(i) => String(i)}
          renderItem={({ item }) => renderSlide(item)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          style={{ flex: 1 }}
        />

        <View style={{ paddingHorizontal: GUTTER, paddingBottom: 8 }}>
          <TouchableOpacity
            style={[styles.button, styles.appleButton, buttonDisabled && styles.buttonDimmed]}
            onPress={() => (onName ? finish() : goTo(step + 1))}
            disabled={buttonDisabled}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={styles.appleText.color as string} />
            ) : (
              <Text style={[styles.buttonText, styles.appleText]}>{onName ? "Let's fight" : "Continue"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
