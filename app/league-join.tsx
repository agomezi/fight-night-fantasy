import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import PressableScale from "../components/PressableScale";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { selectedLeagueKey } from "../constants/storage";
import { useAuth } from "../context/AuthContext";
import { useStanding } from "../context/StandingContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import {
  createLeague,
  joinLeague,
  MAX_MEMBERS,
  MIN_MEMBERS,
  TIER_BLURB,
  TIER_LABEL,
  type LeagueTier,
} from "../services/leagues";
import { suspendedReason } from "../services/standing";
import { makeCommonStyles } from "../styles/common";
import { makeLeaguesStyles } from "../styles/leagues";

type Mode = "create" | "join";
type OpenTier = Exclude<LeagueTier, "hardcore">;
const TIERS: OpenTier[] = ["casual", "amateur", "pro"];

/** Starting a league, or joining one with its invite code. */
export default function LeagueJoin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const { session } = useAuth();
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const styles = useThemedStyles(makeLeaguesStyles);

  const [mode, setMode] = useState<Mode>(params.mode === "join" ? "join" : "create");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<OpenTier>("casual");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A suspended player can't create or join, so say why instead of failing.
  const blocked = suspendedReason(useStanding());
  const ready = !blocked && (mode === "create" ? name.trim().length > 0 : code.trim().length >= 8);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = mode === "create" ? await createLeague(name, tier) : await joinLeague(code);
      const userId = session?.user.id;
      if (userId) {
        try {
          await AsyncStorage.setItem(selectedLeagueKey(userId), id);
        } catch {}
      }
      router.replace("/leagues");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const label = {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1.4,
    marginTop: 26,
    marginBottom: 8,
  };
  const input = {
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: c.text,
    fontSize: 16,
  };

  return (
    <SafeAreaView style={[commonStyles.container, { backgroundColor: c.bg, padding: 0 }]} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        >
          <View style={styles.screenHeader}>
            <PressableScale onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </PressableScale>
            <View style={{ width: 26 }} />
          </View>

          <Text style={styles.screenTitle}>{mode === "create" ? "NEW LEAGUE" : "JOIN A LEAGUE"}</Text>

          <View style={styles.toggleRow}>
            {(["create", "join"] as Mode[]).map((m) => (
              <PressableScale
                key={m}
                onPress={() => {
                  setMode(m);
                  setError(null);
                }}
                style={[styles.toggle, mode === m && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                  {m === "create" ? "CREATE" : "JOIN WITH CODE"}
                </Text>
              </PressableScale>
            ))}
          </View>

          {mode === "create" ? (
            <>
              <Text style={label}>LEAGUE NAME</Text>
              <TextInput
                style={input}
                value={name}
                onChangeText={setName}
                maxLength={40}
                placeholder="The Alpha League"
                placeholderTextColor={c.textFaint}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <Text style={label}>TIER</Text>
              {TIERS.map((t) => (
                <PressableScale
                  key={t}
                  onPress={() => setTier(t)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: tier === t ? c.red : c.border,
                    backgroundColor: tier === t ? c.redTint : c.card,
                  }}
                >
                  <Ionicons
                    name={tier === t ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={tier === t ? c.red : c.textFaint}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: "800" }}>{TIER_LABEL[t]}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>
                      {TIER_BLURB[t]}
                    </Text>
                  </View>
                </PressableScale>
              ))}
              <Text style={{ color: c.textFaint, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                The tier is set for good once the league is made.
              </Text>
            </>
          ) : (
            <>
              <Text style={label}>INVITE CODE</Text>
              <TextInput
                style={[input, { fontSize: 22, fontWeight: "800", letterSpacing: 4 }]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\s/g, "").toUpperCase())}
                maxLength={8}
                placeholder="AB12CD34"
                placeholderTextColor={c.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </>
          )}

          <View style={{ marginTop: 22, gap: 8 }}>
            {[
              `Leagues are ${MIN_MEMBERS} to ${MAX_MEMBERS} players, one head-to-head each card.`,
              "Until Season 1 starts, leagues play a pre-season: real matchups, for practice.",
              "Once a season is under way, new members join at the next one. Their picks still count globally.",
            ].map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={c.textFaint} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, color: c.textMuted, fontSize: 12.5, lineHeight: 18 }}>{line}</Text>
              </View>
            ))}
          </View>

          {blocked && (
            <Text style={{ color: c.red, fontSize: 13.5, fontWeight: "700", marginTop: 18, textAlign: "center" }}>
              {blocked}
            </Text>
          )}

          {!blocked && error && (
            <Text style={{ color: c.red, fontSize: 13.5, fontWeight: "700", marginTop: 18, textAlign: "center" }}>
              {error}
            </Text>
          )}

          <PressableScale
            style={[styles.primaryButton, { opacity: ready ? 1 : 0.45 }]}
            onPress={submit}
            disabled={!ready || busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{mode === "create" ? "CREATE LEAGUE" : "JOIN LEAGUE"}</Text>
            )}
          </PressableScale>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom }} />
    </SafeAreaView>
  );
}
