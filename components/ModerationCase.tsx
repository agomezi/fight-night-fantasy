import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, View } from "react-native";
import PressableScale from "./PressableScale";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import {
  ACTION_LABEL,
  SUSPENSION_DAYS,
  availableActions,
  loadCase,
  moderate,
  suggestion,
  type Action,
  type CaseDetail,
} from "../services/moderation";
import { makeSettingsStyles } from "../styles/settings";

const BUTTON: Record<Action, string> = {
  dismiss: "Dismiss",
  warn: "Warn",
  reset_name: "Reset name",
  suspend: "Suspend",
  ban: "Ban",
  lift: "Lift",
};

function confirmText(action: Action, name: string, standing: string): { title: string; body: string } {
  switch (action) {
    case "dismiss":
      return { title: "Dismiss this case?", body: "No violation. The player isn't told." };
    case "warn":
      return { title: `Warn ${name}?`, body: "They're asked to change their name. The reason is shown to them." };
    case "reset_name":
      return { title: `Reset ${name}'s name?`, body: "Their name is cleared and they pick a new one the next time they open the app." };
    case "suspend":
      return { title: `Suspend ${name}?`, body: "They can look around but can't pick, join leagues, report or rename until it ends." };
    case "ban":
      return {
        title: `Ban ${name}?`,
        body: "Permanent until lifted: they can't sign in and leave every table. Leagues they own pass to another member.",
      };
    case "lift":
      return { title: `Lift the ${standing === "banned" ? "ban" : "suspension"}?`, body: "They're back in good standing and are told so." };
  }
}

const day = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** One case in full, with the actions a moderator can take on it. Every
 * action confirms first. `onDone` runs after an action is recorded. */
export default function ModerationCase({ caseId, onDone }: { caseId: number; onDone: () => void }) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeSettingsStyles);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState<number>(7);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    loadCase(caseId)
      .then(setDetail)
      .catch((e) => setFailed(e instanceof Error ? e.message : "Couldn't load this case."));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  const muted = { color: c.textMuted, fontSize: 13, lineHeight: 18 };

  if (failed) return <Text style={[muted, { textAlign: "center", padding: 24 }]}>{failed}</Text>;
  if (!detail) return <ActivityIndicator color={c.red} style={{ paddingVertical: 40 }} />;

  const name = detail.player.name ?? "(no name)";
  const actions = availableActions(detail);

  const start = (action: Action) => {
    const first = detail.reports.find((r) => r.reason)?.reason;
    setReason(action === "dismiss" || action === "lift" ? "" : first ? first[0].toUpperCase() + first.slice(1) : "");
    setNote("");
    setDays(7);
    setError(null);
    setPending(action);
  };

  const confirm = async () => {
    if (!pending || sending) return;
    setSending(true);
    setError(null);
    try {
      await moderate(detail.id, pending, { reason, note, days: pending === "suspend" ? days : undefined });
      setPending(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record that. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const section = (label: string) => <Text style={styles.sectionLabel}>{label}</Text>;
  const line = (label: string, value: string) => (
    <Text style={muted}>
      <Text style={{ color: c.text2, fontWeight: "700" }}>{label}: </Text>
      {value}
    </Text>
  );
  const prompt = pending ? confirmText(pending, name, detail.player.standing) : null;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{name}</Text>
        <Text style={[muted, { marginTop: 4 }]}>
          Case {detail.id} · {detail.status}
          {detail.player.protected ? " · moderator (never hidden automatically)" : ""}
        </Text>

        {section("PLAYER")}
        <View style={[styles.card, { padding: 16, gap: 6 }]}>
          {line("Past names", detail.player.pastNames.length ? detail.player.pastNames.join(", ") : "none")}
          {line(
            "Standing",
            detail.player.standing === "suspended" && detail.player.until
              ? `suspended until ${day(detail.player.until)}`
              : detail.player.standing
          )}
          {line("Strikes", String(detail.player.strikes))}
          {line("Suggested", suggestion(detail.player.strikes))}
        </View>

        {section(`REPORTS (${detail.reports.length})`)}
        <View style={styles.card}>
          {detail.reports.map((r, i) => (
            <View key={r.id} style={[{ padding: 16, gap: 4 }, i > 0 && styles.rowBorder]}>
              <Text style={{ color: c.text, fontWeight: "700" }}>{r.reason ?? "No reason given"}</Text>
              {r.note ? <Text style={muted}>&ldquo;{r.note}&rdquo;</Text> : null}
              <Text style={[muted, { fontSize: 12 }]}>
                {r.reporter ?? "(no name)"} {r.reporterEstablished ? "" : "(new account) "}· {r.league ?? "leaderboard"} · {day(r.at)}
                {r.reportedName !== detail.player.name ? ` · reported as ${r.reportedName}` : ""}
              </Text>
            </View>
          ))}
        </View>

        {detail.actions.length > 0 && (
          <>
            {section("PAST ACTIONS")}
            <View style={styles.card}>
              {detail.actions.map((a, i) => (
                <View key={a.id} style={[{ padding: 16, gap: 4 }, i > 0 && styles.rowBorder]}>
                  <Text style={{ color: c.text, fontWeight: "700" }}>
                    {ACTION_LABEL[a.action]}
                    {a.expiresAt ? ` until ${day(a.expiresAt)}` : ""}
                  </Text>
                  {a.reason ? <Text style={muted}>Reason: {a.reason}</Text> : null}
                  {a.note ? <Text style={muted}>Note: {a.note}</Text> : null}
                  <Text style={[muted, { fontSize: 12 }]}>
                    {a.moderator ?? "SQL editor"} · {day(a.at)} · case {a.caseId}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {section("ACT")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions.map((a) => (
            <PressableScale
              key={a}
              accessibilityRole="button"
              onPress={() => start(a)}
              style={{
                paddingVertical: 11,
                paddingHorizontal: 16,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: a === "ban" ? c.red : c.border,
                backgroundColor: a === "ban" ? c.redTint : c.card,
              }}
            >
              <Text style={{ color: a === "ban" ? c.red : c.text, fontWeight: "800" }}>{BUTTON[a]}</Text>
            </PressableScale>
          ))}
        </View>
      </ScrollView>

      <Modal visible={!!pending} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !sending && setPending(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: "stretch", gap: 10 }]}>
            <Text style={styles.modalTitle}>{prompt?.title}</Text>
            <Text style={styles.modalText}>{prompt?.body}</Text>

            {pending === "suspend" && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SUSPENSION_DAYS.map((d) => (
                  <PressableScale
                    key={d}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: days === d }}
                    onPress={() => setDays(d)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 9,
                      borderRadius: 8,
                      backgroundColor: days === d ? c.red : c.input,
                    }}
                  >
                    <Text style={{ color: days === d ? "#FFFFFF" : c.text2, fontWeight: "800" }}>
                      {d} {d === 1 ? "day" : "days"}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            )}

            {pending && pending !== "dismiss" && (
              <TextInput
                accessibilityLabel="Reason"
                placeholder={pending === "ban" ? "Reason (for the log)" : "Reason (shown to the player)"}
                placeholderTextColor={c.textFaint}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                style={styles.input}
              />
            )}
            <TextInput
              accessibilityLabel="Note"
              placeholder="Note for moderators (optional)"
              placeholderTextColor={c.textFaint}
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              style={[styles.input, { minHeight: 64 }]}
            />

            {error ? <Text style={{ color: c.red, fontSize: 13 }}>{error}</Text> : null}

            <PressableScale accessibilityRole="button" style={styles.deleteBtn} onPress={confirm} disabled={sending}>
              {sending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteBtnText}>CONFIRM {pending ? BUTTON[pending].toUpperCase() : ""}</Text>
              )}
            </PressableScale>
            <PressableScale accessibilityRole="button" style={styles.cancelBtn} onPress={() => setPending(null)} disabled={sending}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </>
  );
}
