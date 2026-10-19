import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { pickRuleLabel, setPickRule, type PickRule } from "../services/leagues";
import PressableScale from "./PressableScale";

const OPTIONS: { scope: PickRule["scope"]; label: string; detail: string }[] = [
  { scope: "main_event", label: "Main event only", detail: "Everyone has to pick the main event." },
  { scope: "main_card", label: "Main card", detail: "Every main card fight." },
  { scope: "top_n", label: "Top fights", detail: "The main event and the next fights down the card, into the prelims." },
  { scope: "whole_card", label: "Whole card", detail: "Every fight on the card." },
];

/** A Pro league's minimum picks. The owner changes it; everyone else reads
 * it. Missing it loses that week's matchup. */
export default function PickRuleSetting({
  leagueId,
  rule,
  isOwner,
  onChanged,
}: {
  leagueId: string;
  rule: PickRule;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const { c } = useTheme();
  const [saving, setSaving] = useState(false);
  // What top N shows before it's picked, and while it's being adjusted.
  // Adjusting only changes this; Save sends it, once.
  const savedN = rule.scope === "top_n" && rule.topN ? rule.topN : 6;
  const [n, setN] = useState(savedN);

  const save = (next: PickRule) => {
    if (saving) return;
    setSaving(true);
    setPickRule(leagueId, next)
      .then(onChanged)
      .catch((e) => {
        setN(savedN);
        Alert.alert("Couldn't change the rule", (e as Error).message);
      })
      .finally(() => setSaving(false));
  };

  const muted = { color: c.textMuted, fontSize: 12.5, lineHeight: 18 };

  if (!isOwner) {
    return (
      <View style={{ backgroundColor: c.inset, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>{pickRuleLabel(rule)}</Text>
        <Text style={[muted, { marginTop: 4 }]}>
          Miss any of it and you lose that week&apos;s matchup. The league owner sets this.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {OPTIONS.map((o, i) => {
        const on = rule.scope === o.scope;
        const choice: PickRule = o.scope === "top_n" ? { scope: "top_n", topN: n } : { scope: o.scope, topN: null };
        return (
          <View
            key={o.scope}
            style={{ paddingVertical: 12, borderBottomWidth: i === OPTIONS.length - 1 ? 0 : 1, borderBottomColor: c.border }}
          >
            <PressableScale
              onPress={() => !on && save(choice)}
              disabled={saving}
              scaleTo={0.98}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.red : c.textFaint} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: on ? "700" : "500" }}>
                  {o.scope === "top_n" ? `Top ${n} fights` : o.label}
                </Text>
                <Text style={muted}>{o.detail}</Text>
              </View>
              {saving && on && <ActivityIndicator color={c.textMuted} />}
            </PressableScale>
            {o.scope === "top_n" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, marginLeft: 32 }}>
                {[-1, 1].map((step) => {
                  const next = Math.min(20, Math.max(2, n + step));
                  return (
                    <PressableScale
                      key={step}
                      onPress={() => setN(next)}
                      disabled={saving || next === n}
                      hitSlop={8}
                      accessibilityLabel={step < 0 ? "Fewer fights" : "More fights"}
                    >
                      <Ionicons
                        name={step < 0 ? "remove-circle-outline" : "add-circle-outline"}
                        size={24}
                        color={next === n ? c.textFaint : c.text}
                      />
                    </PressableScale>
                  );
                })}
                <Text style={[muted, { flex: 1 }]}>2 to 20 fights</Text>
                {on && n !== savedN && (
                  <PressableScale
                    onPress={() => save({ scope: "top_n", topN: n })}
                    disabled={saving}
                    style={{ backgroundColor: c.red, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>SAVE</Text>
                  </PressableScale>
                )}
              </View>
            )}
          </View>
        );
      })}
      <Text style={[muted, { marginTop: 8 }]}>
        Miss any of it and you lose that week&apos;s matchup. A change applies from the next card to start.
      </Text>
    </View>
  );
}
