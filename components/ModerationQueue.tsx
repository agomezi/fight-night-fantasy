import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import PressableScale from "./PressableScale";
import { getInitials } from "../context/ProfileContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import {
  ACTION_LABEL,
  loadHistory,
  loadQueue,
  openFor,
  type HistoryItem,
  type QueueItem,
} from "../services/moderation";
import { makeSettingsStyles } from "../styles/settings";

type Tab = "queue" | "history";
type State<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: T[] };

/** Open cases, most reporters first, and a history of recent decisions.
 * `refreshKey` reloads both, so the screen can refresh on returning to it. */
export default function ModerationQueue({ onOpenCase, refreshKey = 0 }: { onOpenCase: (caseId: number) => void; refreshKey?: number }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<State<QueueItem>>({ status: "loading" });
  const [history, setHistory] = useState<State<HistoryItem>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const fail = (e: unknown) => ({ status: "error" as const, message: e instanceof Error ? e.message : "Couldn't load." });
    await Promise.all([
      loadQueue().then((items) => setQueue({ status: "ready", items })).catch((e) => setQueue(fail(e))),
      loadHistory().then((items) => setHistory({ status: "ready", items })).catch((e) => setHistory(fail(e))),
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const muted = { color: c.textMuted, fontSize: 13 };
  const chip = (text: string, key?: string) => (
    <View key={key ?? text} style={{ backgroundColor: c.inset, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ color: c.text2, fontSize: 11.5, fontWeight: "700" }}>{text}</Text>
    </View>
  );

  const body = <T,>(state: State<T>, empty: string, row: (item: T, i: number) => React.ReactNode) => {
    if (state.status === "loading") return <ActivityIndicator color={c.red} style={{ paddingVertical: 32 }} />;
    if (state.status === "error") return <Text style={[muted, { textAlign: "center", paddingVertical: 24 }]}>{state.message}</Text>;
    if (!state.items.length) return <Text style={[muted, { textAlign: "center", paddingVertical: 24 }]}>{empty}</Text>;
    return <View style={styles.card}>{state.items.map(row)}</View>;
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.textMuted} />}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["queue", "history"] as Tab[]).map((t) => (
          <PressableScale
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: tab === t ? c.red : c.card,
              borderWidth: 1,
              borderColor: tab === t ? c.red : c.border,
            }}
          >
            <Text style={{ color: tab === t ? "#FFFFFF" : c.text2, fontWeight: "800", fontSize: 13 }}>
              {t === "queue" ? `Queue${queue.status === "ready" ? ` (${queue.items.length})` : ""}` : "History"}
            </Text>
          </PressableScale>
        ))}
      </View>

      <View style={{ marginTop: 16 }}>
        {tab === "queue"
          ? body(queue, "No open cases. All clear.", (item, i) => (
              <PressableScale
                key={item.caseId}
                accessibilityLabel={`Case ${item.caseId}: ${item.name ?? "No name"}`}
                onPress={() => onOpenCase(item.caseId)}
                style={[styles.row, i > 0 && styles.rowBorder, { alignItems: "flex-start" }]}
              >
                <View
                  style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.input, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: c.text, fontWeight: "800" }}>{getInitials(item.name ?? "?")}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.rowLabel, { flex: 0 }]}>{item.name ?? "(no name)"}</Text>
                    {item.protected && chip("MOD")}
                    {item.standing !== "active" && chip(item.standing.toUpperCase())}
                  </View>
                  <Text style={muted}>
                    {item.reporters} {item.reporters === 1 ? "reporter" : "reporters"} · open {openFor(item.openedAt)}
                    {item.strikes > 0 ? ` · ${item.strikes} ${item.strikes === 1 ? "strike" : "strikes"}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{item.reasons.map((r) => chip(r))}</View>
                </View>
              </PressableScale>
            ))
          : body(history, "No decisions yet.", (item, i) => (
              <PressableScale
                key={item.actionId}
                onPress={() => onOpenCase(item.caseId)}
                style={[styles.row, i > 0 && styles.rowBorder, { alignItems: "flex-start" }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.rowLabel, { flex: 0 }]}>
                    {ACTION_LABEL[item.action]} · {item.playerName ?? "(no name)"}
                  </Text>
                  {item.reason ? <Text style={muted}>Reason: {item.reason}</Text> : null}
                  {item.note ? <Text style={muted}>Note: {item.note}</Text> : null}
                  <Text style={[muted, { fontSize: 12 }]}>
                    {item.moderator ?? "SQL editor"} · {item.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Text>
                </View>
              </PressableScale>
            ))}
      </View>
    </ScrollView>
  );
}
