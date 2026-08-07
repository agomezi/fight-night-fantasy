import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import PressableScale from "./PressableScale";

export type Corner = "red" | "blue";
export type Method = "KO" | "SUB";
/**
 * How the fight ends:
 *   number — inside the distance, in that round
 *   "ANY"  — inside the distance, round not called
 *   "DEC"  — goes to the judges
 *
 * "ANY" exists because calling the method is a different confidence level from
 * calling the round. Plenty of picks are "he gets finished" without a view on
 * when, and forcing a round on those makes people guess.
 */
export type Finish = number | "DEC" | "ANY";

export type LanePick = {
  corner: Corner;
  finish: Finish;
  /**
   * Optional on purpose. "Pereira to win" is a complete pick; method and round
   * are refinements on top of it, and each can be given independently.
   */
  method?: Method;
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
 * scored — the actual finish draws as a dashed outline, an opponent's pick as
 * an underline — so nothing is redrawn to show what happened.
 *
 * Corners come from the sport: every bout assigns one fighter the red corner
 * and one the blue. The rails carry that, so the colour means something rather
 * than just marking the thing you tapped.
 *
 * Accessibility: red/blue is the real convention but also the pairing most
 * affected by colour deficiency, so colour never carries corner identity
 * alone. The RED/BLUE label is always present as text and every placed marker
 * prints its method in the cell. The lane reads in greyscale.
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
  /** Scheduled length. Championship and main events go 5. */
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

  const tint = (corner: Corner) => (corner === "red" ? c.red : c.blue);

  const select = (corner: Corner, finish: Finish) => {
    if (disabled || !onPick) return;
    const same = pick && pick.corner === corner && pick.finish === finish;
    // Method carries over when you refine a pick, and a decision clears it.
    onPick(
      same
        ? null
        : { corner, finish, method: finish === "DEC" ? undefined : pick?.method },
    );
  };

  const setMethod = (m: Method) => {
    if (!pick || disabled || !onPick) return;
    onPick({ ...pick, method: pick.method === m ? undefined : m });
  };

  const readback = () => {
    if (!pick) return "Tap a fighter to pick them, or a round to call the finish";
    const who = pick.corner === "red" ? red.name : blue.name;
    if (pick.finish === "DEC") return `${who} by decision`;

    const how = pick.method === "KO" ? "KO/TKO" : "submission";
    if (pick.finish === "ANY") {
      return pick.method ? `${who} by ${how} — any round` : `${who} to win`;
    }
    return pick.method
      ? `${who} by ${how} in Round ${pick.finish}`
      : `${who} to finish in Round ${pick.finish}`;
  };

  const Rail = ({ corner }: { corner: Corner }) => {
    const fighter = corner === "red" ? red : blue;
    const accent = tint(corner);
    const isMine = pick?.corner === corner;
    // Tapping the name picks the fighter without calling a round.
    const noRound = isMine && pick?.finish === "ANY";

    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <PressableScale
          disabled={disabled}
          haptic={noRound ? "none" : "light"}
          scaleTo={0.95}
          onPress={() => select(corner, "ANY")}
          style={{
            width: 88,
            paddingRight: 8,
            paddingLeft: 7,
            paddingVertical: 5,
            marginRight: 2,
            borderRadius: 8,
            borderLeftWidth: 3,
            borderLeftColor: isMine ? accent : c.border,
            backgroundColor: noRound ? c.redTint : "transparent",
          }}
        >
          <Text
            style={{
              color: accent,
              fontSize: 8.5,
              fontWeight: "800",
              letterSpacing: 1,
            }}
          >
            {corner === "red" ? "RED CORNER" : "BLUE CORNER"}
          </Text>
          <Text
            style={{
              fontFamily: "BebasNeue",
              fontSize: 18,
              color: c.text,
              letterSpacing: 0.5,
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {fighter.name}
          </Text>
          <Text style={{ fontSize: 10, color: c.textFaint, marginTop: -2 }}>
            {noRound
              ? pick!.method
                ? `${pick!.method === "KO" ? "KO/TKO" : "SUB"} · any round`
                : "To win"
              : fighter.record}
          </Text>
        </PressableScale>

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            gap: 3,
            padding: 3,
            borderRadius: 10,
            backgroundColor: corner === "red" ? c.redTint : "rgba(90,169,230,0.10)",
          }}
        >
          {columns.map((col) => {
            const mine = pick && pick.corner === corner && pick.finish === col;
            const isActual =
              actual && actual.corner === corner && actual.finish === col;
            const isRival =
              rivalPick && rivalPick.corner === corner && rivalPick.finish === col;

            // A filled cell shows the method when one is given, otherwise it
            // keeps the round number — the fill alone says "this is my pick".
            const glyph =
              col === "DEC"
                ? "DEC"
                : mine && pick!.method
                  ? pick!.method
                  : String(col);

            return (
              <PressableScale
                key={String(col)}
                disabled={disabled}
                haptic={mine ? "none" : "light"}
                scaleTo={0.9}
                onPress={() => select(corner, col)}
                style={{
                  flex: col === "DEC" ? 1.35 : 1,
                  height: 44,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: mine
                    ? "transparent"
                    : isActual
                      ? c.text
                      : c.borderStrong,
                  borderStyle: isActual && !mine ? "dashed" : "solid",
                  backgroundColor: mine ? accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: mine ? 10 : 12,
                    fontWeight: mine ? "800" : "600",
                    letterSpacing: mine ? 0.4 : 0,
                    color: mine ? "#FFFFFF" : c.textFaint,
                  }}
                >
                  {glyph}
                </Text>

                {isRival && (
                  <View
                    style={{
                      position: "absolute",
                      left: 5,
                      right: 5,
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
        <View style={{ width: 88 }} />
        <View style={{ flex: 1, flexDirection: "row", gap: 3, paddingHorizontal: 3 }}>
          {columns.map((col) => (
            <Text
              key={String(col)}
              style={{
                flex: col === "DEC" ? 1.35 : 1,
                fontSize: 8.5,
                fontWeight: "800",
                letterSpacing: 1,
                color: c.textFaint,
                textAlign: "center",
              }}
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
            fontSize: 13,
            fontWeight: pick ? "700" : "400",
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
              borderRadius: 10,
              borderWidth: 1,
              borderColor: c.borderStrong,
            }}
          >
            {(["KO", "SUB"] as Method[]).map((m) => {
              const on = pick.method === m;
              return (
                <PressableScale
                  key={m}
                  scaleTo={0.92}
                  onPress={() => setMethod(m)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 7,
                    backgroundColor: on ? c.red : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9.5,
                      fontWeight: "800",
                      letterSpacing: 1,
                      color: on ? "#FFFFFF" : c.textFaint,
                    }}
                  >
                    {m === "KO" ? "KO/TKO" : "SUB"}
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
                  borderColor: c.text,
                }}
              />
              <Text style={{ fontSize: 10.5, color: c.textFaint }}>Actual finish</Text>
            </View>
          )}
          {rivalPick && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{ width: 15, height: 3, borderRadius: 2, backgroundColor: c.textMuted }}
              />
              <Text style={{ fontSize: 10.5, color: c.textFaint }}>
                {rivalName ?? "Opponent"}&apos;s pick
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
