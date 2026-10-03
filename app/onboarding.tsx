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
import { cleanHandle, handleProblem, HandleTakenError, HANDLE_MAX, isHandleAvailable } from "../services/profile";
import { DEDUCTIONS, POINTS, UNDERDOG_MULTIPLIER } from "../services/scoring";
import { CAP, CAP_TOP, GUTTER, LEFT_BEARING, makeLoginStyles } from "../styles/login";

/*
 * First run: a short tour of how the game works, then a name. Same poster
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
    body: "Picks lock for the whole card when the first bout starts. Results land minutes after each fight, and scores settle once they're official.",
    rows: [
      { label: "First bell", value: "LOCKED" },
      { label: "Fight ends", value: "LIVE" },
      { label: "Official", value: "FINAL" },
    ],
  },
  {
    eyebrow: "LEAGUES",
    lines: ["BRING YOUR", "CREW"],
    body: "Start a private league with friends. Everyone plays the same rules, and you face a different member every card.",
    rows: [
      { label: "League size", value: "4–12" },
      { label: "Tiers", value: "CASUAL · AMATEUR · PRO" },
      { label: "Every card", value: "NEW OPPONENT" },
    ],
  },
  {
    eyebrow: "LEADERBOARDS",
    lines: ["CLIMB THE", "RANKS"],
    body: "Every card adds to your season. Points show how much you won; accuracy shows how often you were right.",
    rows: [
      { label: "Season", value: "11 CARDS" },
      { label: "Ranked by", value: "POINTS + ACCURACY" },
    ],
  },
];

const NAME_STEP = SLIDES.length;
const STEPS = SLIDES.length + 1;

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
  const { setUsername } = useProfile();
  const list = useRef<FlatList<number>>(null);
  const [step, setStep] = useState(0);

  const ink = styles.heading.color as string;
  const muted = styles.footnote.color as string;
  const rule = c.statusBar === "light" ? "#2A2A2A" : "#D9D5CD";
  // Sized so the longest headline line ("BRING YOUR") fits the screen.
  const headlineSize = Math.min(72, (width - GUTTER * 2) / 4.3);

  // --- name -----------------------------------------------------------------
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState<"idle" | "checking" | "free" | "taken" | "error">("idle");
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
      isHandleAvailable(name)
        .then((free) => current && setAvailability(free ? "free" : "taken"))
        .catch(() => current && setAvailability("error"));
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [name]);

  const canFinish = !!name && !problem && availability !== "taken" && availability !== "checking" && !saving;

  const finish = async () => {
    if (!canFinish) return;
    setSaving(true);
    try {
      await setUsername(name);
      router.replace("/home");
    } catch (e) {
      if (e instanceof HandleTakenError) setAvailability("taken");
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
        : availability === "free"
          ? "It's yours."
          : availability === "error"
            ? "Couldn't check right now — you can still try."
            : `3–${HANDLE_MAX} letters, numbers or underscores. You can change it later.`);
  const hintColor = problem || availability === "taken" ? c.red : availability === "free" ? c.green : muted;

  const renderSlide = (index: number) => {
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
              borderBottomColor: problem || availability === "taken" ? c.red : ink,
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
            {(availability === "taken" || problem) && <Ionicons name="close-circle" size={24} color={c.red} />}
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
                {onName ? "LAST STEP" : SLIDES[step].eyebrow}
              </Animated.Text>
            </View>
            {!onName && (
              <TouchableOpacity onPress={() => goTo(NAME_STEP)} hitSlop={12} accessibilityRole="button">
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
