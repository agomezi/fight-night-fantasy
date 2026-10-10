import { useState } from "react";
import { Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import {
  divisionLabel,
  fighterAge,
  finishRate,
  heightLabel,
  initials,
  lastName,
  reachLabel,
  type SpotlightFighter,
} from "../services/events";
import { makeCommonStyles } from "../styles/common";
import FighterPhoto from "./FighterPhoto";
import PressableScale from "./PressableScale";
import Skeleton from "./Skeleton";
import { StatBox, StatBoxRow } from "./StatBox";

/**
 * The body of the Fighter Spotlight card: a fighter from the next card with
 * their record and measurements, and a switch to their opponent. `fighters`
 * is null while the card loads and empty when there's no card.
 */
export default function FighterSpotlight({
  fighters,
  now,
}: {
  fighters: SpotlightFighter[] | null;
  now: Date;
}) {
  const { c } = useTheme();
  const commonStyles = useThemedStyles(makeCommonStyles);
  const [shown, setShown] = useState(0);

  if (fighters === null) {
    return (
      <View testID="spotlight-loading">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <Skeleton width={64} height={64} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={20} />
            <Skeleton width="45%" />
          </View>
        </View>
        <Skeleton height={56} radius={10} />
      </View>
    );
  }

  if (fighters.length === 0) {
    return (
      <Text style={[commonStyles.cardSubtitle, { textAlign: "left", marginBottom: 0 }]}>
        The spotlight returns once the next card is announced.
      </Text>
    );
  }

  // A new card can bring fewer fighters than the one shown before.
  const current = fighters[Math.min(shown, fighters.length - 1)];
  const { fighter, opponent, bout, dog } = current;
  const division = divisionLabel(bout.weightClass);
  const age = fighterAge(fighter.dob, now);
  const height = heightLabel(fighter.heightIn);
  const details = [division, fighter.record, age == null ? null : `${age} YRS`, height].filter(Boolean).join(" · ");
  const ufc = fighter.ufc;
  const finishes = finishRate(ufc);
  const how = ufc
    ? [ufc.koWins && `${ufc.koWins} by KO`, ufc.subWins && `${ufc.subWins} by submission`].filter(Boolean).join(", ")
    : "";

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            backgroundColor: c.input,
            borderWidth: 1,
            borderColor: c.borderStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FighterPhoto
            uri={fighter.photoUrl}
            initials={initials(fighter.name)}
            radius={12}
            textStyle={{ fontSize: 18, fontWeight: "700", color: c.text }}
          />
          {dog && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: -8,
                alignSelf: "center",
                backgroundColor: c.red,
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 }}>DOG</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[commonStyles.cardTitle, { textAlign: "left", fontSize: 20, marginBottom: 2 }]}
          >
            {fighter.name.toUpperCase()}
          </Text>
          {fighter.nickname ? (
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: c.text2, marginBottom: 2 }}>
              “{fighter.nickname}”
            </Text>
          ) : null}
          {details ? (
            <Text style={[commonStyles.cardSubtitle, { textAlign: "left", marginBottom: 0 }]}>{details}</Text>
          ) : null}
        </View>
      </View>

      <Text style={{ fontSize: 13, color: c.text2, marginBottom: 16, lineHeight: 18 }}>
        {finishes != null ? (
          <Text style={{ fontWeight: "700" }}>
            Finishes {finishes}% of UFC wins{how ? `: ${how}` : ""}.{" "}
          </Text>
        ) : null}
        {bout.order === 1 ? "Headlines" : "Fights"} against {opponent.name}
        {opponent.record ? ` (${opponent.record})` : ""}
        {dog ? ". The books have them as the underdog." : "."}
      </Text>

      <StatBoxRow inline>
        <StatBox value={finishes == null ? "—" : `${finishes}%`} label="FINISH RATE" accent />
        <StatBox value={ufc ? String(ufc.winStreak) : "—"} label="WIN STREAK" />
        <StatBox value={reachLabel(fighter.reachIn) ?? "—"} label="REACH" />
      </StatBoxRow>

      {fighters.length > 1 && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {fighters.map((f, i) => {
            const selected = f === current;
            return (
              <PressableScale
                key={f.fighter.id}
                onPress={() => setShown(i)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: selected ? c.red : c.borderStrong,
                  backgroundColor: selected ? c.red : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 1,
                    color: selected ? "#FFFFFF" : c.text,
                  }}
                >
                  {lastName(f.fighter.name).toUpperCase()}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}
    </View>
  );
}
