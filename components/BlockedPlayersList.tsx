import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import PressableScale from "./PressableScale";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { loadBlocked, unblockPlayer, type BlockedPlayer } from "../services/blocks";
import { makeSettingsStyles } from "../styles/settings";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: BlockedPlayer[] };

/** The players you've blocked, each with Unblock. */
export default function BlockedPlayersList() {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    loadBlocked()
      .then((items) => current && setState({ status: "ready", items }))
      .catch((e) => current && setState({ status: "error", message: e instanceof Error ? e.message : "Couldn't load." }));
    return () => {
      current = false;
    };
  }, []);

  const unblock = async (p: BlockedPlayer) => {
    if (busy) return;
    setBusy(p.userId);
    setError(null);
    try {
      await unblockPlayer(p.userId);
      setState((s) => (s.status === "ready" ? { ...s, items: s.items.filter((i) => i.userId !== p.userId) } : s));
    } catch {
      setError(`Couldn't unblock ${p.name}. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  const muted = { color: c.textMuted, fontSize: 13.5, textAlign: "center" as const, paddingVertical: 24 };
  if (state.status === "loading") return <ActivityIndicator color={c.red} style={{ paddingVertical: 32 }} />;
  if (state.status === "error") return <Text style={muted}>{state.message}</Text>;
  if (!state.items.length) {
    return <Text style={muted}>You haven&apos;t blocked anyone. Block a player from their profile in a league.</Text>;
  }

  return (
    <View>
      <View style={styles.card}>
        {state.items.map((p, i) => (
          <View key={p.userId} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.inset, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: c.textMuted, fontWeight: "800" }}>{getInitials(p.name)}</Text>
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>{p.name}</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${p.name}`}
              onPress={() => unblock(p)}
              disabled={!!busy}
              style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: c.border }}
            >
              {busy === p.userId ? (
                <ActivityIndicator color={c.text2} />
              ) : (
                <Text style={{ color: c.text, fontWeight: "700" }}>Unblock</Text>
              )}
            </PressableScale>
          </View>
        ))}
      </View>
      {error && <Text style={{ color: c.red, fontSize: 13, marginTop: 10, textAlign: "center" }}>{error}</Text>}
      <Text style={styles.hint}>
        Blocked players show as &ldquo;Blocked player&rdquo; to you in your leagues, matchups and the leaderboard, and you
        don&apos;t hear when they join your leagues. They aren&apos;t told.
      </Text>
    </View>
  );
}
