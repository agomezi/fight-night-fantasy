import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { RADIUS, FONTS, label as labelType } from "../constants/type";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

export type Corner = "red" | "blue";
export type Method = "KO" | "SUB";
/** A round number, or "DEC" when the fight goes to the judges. */
export type Finish = number | "DEC";

export type LanePick = {
  corner: Corner;
  finish: Finish;
  method: Method;
};

export type LaneFighter = { name: string; record: string };

/*
 * One lane holds all three parts of a pick.
 *
 *   which rail you place on  -> who wins
 *   which column             -> the round, or a decision
 *   the method toggle        -> KO/TKO or submission (suppressed on DEC)
 *
 * Chip rows are a form; a bout is a timeline that ends somewhere, and this is
 * that shape. The same object also displays the result once the bout is
 * scored — the actual finish draws as a brass outline, and an opponent's pick
 * as an underline — so nothing has to be redrawn to show what happened.
 *
 * Accessibility: red/blue is the real corner convention but also the pairing
 * most affected by colour deficiency, so colour never carries corner identity
 * alone. The RED/BLUE label is always present as text and every placed marker
 * prints its method inside the cell. The lane reads in greyscale.
 */
export default function RoundLane({
  rounds,
  red,
  blue,
  pick,
  onPick,
  actual,
  rivalPick,
  rivalName,
  disabled,
}: {
  /** Scheduled length. Championship and main events are 5. */
  rounds: 3 | 5;
  red: LaneFighter;
  blue: LaneFighter;
  pick?: LanePick | null;
  onPick?: (next: LanePick | null) => void;
  /** Set once the bout is scored. */
  actual?: LanePick | null;
  rivalPick?: LanePick | null;
  rivalName?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();

  const columns: Finish[] = [
    ...Array.from({ length: rounds }, (_, i) => i + 1),
    "DEC",
  ];

  const tint = (corner: Corner) =>
    corner === "red" ? c.cornerRed : c.cornerBlue;

  const select = (corner: Corner, finish: Finish) => {
    if (disabled || !onPick) return;
    const same = pick && pick.corner === corner && pick.finish === finish;
    if (same) {
      onPick(null);
      return;
    }
    onPick({ corner, finish, method: pick?.method ?? "KO" });
  };

  const readback = () => {
    if (!pick) return "No pick yet — tap a round";
    const who = pick.corner === "red" ? red.name : blue.name;
    if (pick.finish === "DEC") return `${who} by decision`;
    const how = pick.method === "KO" ? "KO/TKO" : "submission";
    return `${who} by ${how} in Round ${pick.finish}`;
  };

  const Rail = ({ corner }: { corner: Corner }) => {
    const fighter = corner === "red" ? red : blue;
    const accent = tint(corner);

    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 92, paddingRight: 10 }}>
          <Text style={[labelType, { color: accent, fontSize: 8.5 }]}>
            {corner === "red" ? "Red corner" : "Blue corner"}
          </Text>
          <Text
            style={{
              fontFamily: FONTS.display,
              fontSize: 14,
              color: c.text,
              marginTop: 2,
              letterSpacing: -0.3,
            }}
            numberOfLines={1}
          >
            {fighter.name}
          </Text>
          <Text
            style={{
              fontFamily: FONTS.sans,
              fontSize: 10,
              color: c.textFaint,
              fontVariant: ["tabular-nums"],
            }}
          >
            {fighter.record}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            gap: 3,
            padding: 3,
            borderRadius: RADIUS.sm,
            backgroundColor: corner === "red" ? c.redTint : "rgba(42,107,212,0.10)",
          }}
        >
          {columns.map((col) => {
            const mine =
              pick && pick.corner === corner && pick.finish === col;
            const isActual =
              actual && actual.corner === corner && actual.finish === col;
            const isRival =
              rivalPick && rivalPick.corner === corner && rivalPick.finish === col;

            const glyph = mine
              ? col === "DEC"
                ? "DEC"
                : pick!.method
              : col === "DEC"
                ? "DEC"
                : String(col);

            return (
              <PressableScale
                key={String(col)}
                disabled={disabled}
                haptic={mine ? "none" : "light"}
                scaleTo={0.9}
                onPress={() => select(corner, col)}
                style={{
                  flex: col === "DEC" ? 1.3 : 1,
                  height: 44,
                  borderRadius: RADIUS.sm - 2,
                  borderWidth: 1,
                  borderColor: mine
                    ? "transparent"
                    : isActual
                      ? c.belt
                      : c.border,
                  borderStyle: isActual && !mine ? "dashed" : "solid",
                  backgroundColor: mine ? accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: mine ? FONTS.sansBold : FONTS.sansMed,
                    fontSize: mine ? 10 : 11,
                    letterSpacing: mine ? 0.5 : 0,
                    color: mine ? c.onAccent : c.textFaint,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {glyph}
                </Text>

                {isRival && (
                  <View
                    style={{
                      position: "absolute",
                      left: 4,
                      right: 4,
                      bottom: 4,
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: c.textMuted,
                    }}
                  />
                )}
              </PressableScale>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View>
      {/* column ruler */}
      <View style={{ flexDirection: "row", marginBottom: 5 }}>
        <View style={{ width: 92 }} />
        <View style={{ flex: 1, flexDirection: "row", gap: 3, paddingHorizontal: 3 }}>
          {columns.map((col) => (
            <Text
              key={String(col)}
              style={[
                labelType,
                {
                  flex: col === "DEC" ? 1.3 : 1,
                  fontSize: 8.5,
                  color: c.textFaint,
                  textAlign: "center",
                },
              ]}
            >
              {col === "DEC" ? "DEC" : `R${col}`}
            </Text>
          ))}
        </View>
      </View>

      <Rail corner="red" />
      <View style={{ height: 6 }} />
      <Rail corner="blue" />

      {/* readback + method */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: pick ? FONTS.sansBold : FONTS.sans,
            fontSize: 13,
            color: pick ? c.text : c.textFaint,
          }}
        >
          {readback()}
        </Text>

        {pick && pick.finish !== "DEC" && !disabled && (
          <Animated.View
            entering={FadeIn.duration(160)}
            style={{
              flexDirection: "row",
              gap: 3,
              padding: 3,
              borderRadius: RADIUS.sm,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            {(["KO", "SUB"] as Method[]).map((m) => {
              const on = pick.method === m;
              return (
                <PressableScale
                  key={m}
                  scaleTo={0.92}
                  onPress={() => onPick?.({ ...pick, method: m })}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: RADIUS.sm - 2,
                    backgroundColor: on ? c.text : "transparent",
                  }}
                >
                  <Text
                    style={[
                      labelType,
                      { fontSize: 9, color: on ? c.bg : c.textFaint },
                    ]}
                  >
                    {m === "KO" ? "KO/TKO" : "Sub"}
                  </Text>
                </PressableScale>
              );
            })}
          </Animated.View>
        )}
      </View>

      {(actual || rivalPick) && (
        <View style={{ flexDirection: "row", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {actual && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 15,
                  height: 10,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: c.belt,
                }}
              />
              <Text style={{ fontFamily: FONTS.sans, fontSize: 10.5, color: c.textFaint }}>
                Actual finish
              </Text>
            </View>
          )}
          {rivalPick && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{ width: 15, height: 3, borderRadius: 2, backgroundColor: c.textMuted }}
              />
              <Text style={{ fontFamily: FONTS.sans, fontSize: 10.5, color: c.textFaint }}>
                {rivalName ?? "Opponent"}&apos;s pick
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
