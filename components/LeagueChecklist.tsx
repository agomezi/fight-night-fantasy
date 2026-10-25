import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import {
  leagueChecklist,
  leagueStarted,
  loadChecklistTicks,
  loadStartedLeagues,
  saveChecklistTicks,
  type ChecklistStep,
  type ChecklistTicks,
} from "../services/leagueOnboarding";
import type { MyLeague } from "../services/leagues";
import { makeLeaguesStyles } from "../styles/leagues";
import AnimatedBar from "./AnimatedBar";
import PressableScale from "./PressableScale";

/** What an owner should do before the league's first card: invite enough
 * players, choose the minimum picks, know about doubleheaders. Goes away once
 * every step is done, the first card locks, or the owner closes it. */
export default function LeagueChecklist({
  league,
  userId,
  weeks,
  onInvite,
}: {
  league: MyLeague;
  userId: string | null;
  weeks: { state: "upcoming" | "live" | "final" }[];
  onInvite: () => void;
}) {
  const { c } = useTheme();
  const styles = useThemedStyles(makeLeaguesStyles);
  const router = useRouter();
  const [ticks, setTicks] = useState<ChecklistTicks | null>(null);
  // Undefined until the server answers, or if it can't.
  const [startedOnServer, setStartedOnServer] = useState<boolean | undefined>(undefined);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId || !league.isOwner) return;
    let current = true;
    loadChecklistTicks(userId, league.id).then((t) => current && setTicks(t));
    loadStartedLeagues()
      .then((m) => current && setStartedOnServer(m.get(league.id)))
      .catch(() => {})
      .finally(() => current && setChecked(true));
    return () => {
      current = false;
    };
  }, [userId, league.id, league.isOwner]);

  if (!userId || !ticks || !checked) return null;
  const list = leagueChecklist(league, ticks, leagueStarted(startedOnServer, weeks));
  if (!list) return null;

  const tick = (more: ChecklistTicks) => {
    const next = { ...ticks, ...more };
    setTicks(next);
    saveChecklistTicks(userId, league.id, next);
  };

  const action = (step: ChecklistStep) => {
    if (step.done) return null;
    if (step.id === "invite") return <StepButton label="INVITE" onPress={onInvite} primary />;
    if (step.id === "minimum") {
      return (
        <View style={{ flexDirection: "row", gap: 18 }}>
          <StepButton
            label="CHOOSE MINIMUM →"
            primary
            onPress={() => {
              tick({ minimum: true });
              router.push(`/league-settings?id=${league.id}`);
            }}
          />
          <StepButton label={`KEEP ${minimumLabel(league).toUpperCase()}`} onPress={() => tick({ minimum: true })} />
        </View>
      );
    }
    if (step.id === "doubleheader") return <StepButton label="GOT IT" onPress={() => tick({ doubleheader: true })} />;
    return null;
  };

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Before the first card</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={styles.cardMeta}>
            {list.done} OF {list.total}
          </Text>
          <PressableScale onPress={() => tick({ dismissed: true })} hitSlop={12} accessibilityLabel="Hide the checklist">
            <Ionicons name="close" size={18} color={c.textFaint} />
          </PressableScale>
        </View>
      </View>
      <View style={{ marginTop: 10, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 }}>
        <AnimatedBar percent={(list.done / list.total) * 100} height={4} />
        {list.steps.map((step, i) => (
          <View
            key={step.id}
            style={{
              flexDirection: "row",
              gap: 12,
              paddingTop: 12,
              paddingBottom: i === list.steps.length - 1 ? 0 : 12,
              borderBottomWidth: i === list.steps.length - 1 ? 0 : 1,
              borderBottomColor: c.border,
            }}
          >
            <Ionicons
              name={step.done ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={step.done ? c.red : c.textFaint}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: step.done ? c.textMuted : c.text,
                  fontSize: 14.5,
                  fontWeight: "700",
                  textDecorationLine: step.done ? "line-through" : "none",
                }}
              >
                {step.title}
              </Text>
              <Text style={{ color: step.done ? c.textFaint : c.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>
                {step.detail}
              </Text>
              {action(step)}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function minimumLabel(league: MyLeague): string {
  const scope = league.rule?.scope;
  if (scope === "whole_card") return "whole card";
  if (scope === "top_n" && league.rule?.topN) return `top ${league.rule.topN}`;
  if (scope === "main_card") return "main card";
  return "main event";
}

function StepButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { c } = useTheme();
  return (
    <PressableScale onPress={onPress} hitSlop={8} style={{ marginTop: 8, paddingVertical: 6 }}>
      <Text style={{ color: primary ? c.red : c.text2, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.8 }}>{label}</Text>
    </PressableScale>
  );
}
