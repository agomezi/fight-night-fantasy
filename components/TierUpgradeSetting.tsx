import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import {
  cancelTierUpgrade,
  higherTiers,
  scheduleTierUpgrade,
  TIER_LABEL,
  tierLine,
  tierUpgradeConfirm,
  tierUpgradeDone,
  type MyLeague,
  type OpenTier,
} from "../services/leagues";
import PressableScale from "./PressableScale";

/** Moving the league up a tier. The owner picks a higher one, which starts
 * next season (at once in the pre-season) and can be called off until then;
 * everyone else sees what's coming. */
export default function TierUpgradeSetting({
  league,
  preseason,
  onChanged,
}: {
  league: MyLeague;
  preseason: boolean;
  onChanged: () => void;
}) {
  const { c } = useTheme();
  const [saving, setSaving] = useState(false);

  const up = league.upgrade;
  const options = higherTiers(league.tier);
  const muted = { color: c.textMuted, fontSize: 12.5, lineHeight: 18 };

  if (!league.isOwner && !up) return null;
  if (league.isOwner && !up && !options.length) return null;

  const run = (work: () => Promise<unknown>, failTitle: string) => {
    setSaving(true);
    work()
      .then(onChanged)
      .catch((e) => Alert.alert(failTitle, (e as Error).message))
      .finally(() => setSaving(false));
  };

  const confirm = (tier: OpenTier) => {
    const { title, body } = tierUpgradeConfirm(league.name, tier, preseason);
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      {
        text: `Move up to ${TIER_LABEL[tier]}`,
        onPress: () =>
          run(async () => {
            const done = tierUpgradeDone(league.name, tier, await scheduleTierUpgrade(league.id, tier));
            if (done) Alert.alert("Moving up", done);
          }, "Couldn't change the tier"),
      },
    ]);
  };

  const choose = () => {
    if (saving) return;
    if (options.length === 1) return confirm(options[0]);
    Alert.alert("Move up to", "A league can move up a tier, never down.", [
      ...options.map((t) => ({ text: TIER_LABEL[t], onPress: () => confirm(t) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const callOff = () => {
    if (saving || !up) return;
    Alert.alert(`Stay ${TIER_LABEL[up.from]}?`, `${league.name} won't move up to ${TIER_LABEL[up.tier]} in Season ${up.season}.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Call it off", style: "destructive", onPress: () => run(() => cancelTierUpgrade(league.id), "Couldn't call it off") },
    ]);
  };

  return (
    <View style={{ backgroundColor: c.inset, borderRadius: 12, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>{tierLine(league)}</Text>
          <Text style={[muted, { marginTop: 4 }]}>
            {up
              ? league.isOwner
                ? "Everyone in the league has been told. You can call it off until the season starts."
                : "The league owner set this. This season's cards stay as they are."
              : preseason
                ? "Move up a tier now. You can't move back down."
                : "Move up a tier from next season. You can't move back down."}
          </Text>
        </View>
        {league.isOwner &&
          (saving ? (
            <ActivityIndicator color={c.textMuted} />
          ) : (
            <PressableScale onPress={up ? callOff : choose} hitSlop={8}>
              <Text style={{ color: up ? c.textMuted : c.red, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.8 }}>
                {up ? "CALL OFF" : "MOVE UP"}
              </Text>
            </PressableScale>
          ))}
      </View>
    </View>
  );
}
