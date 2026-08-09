import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";

export type BoutSide = {
  /** Initials until real fighter art exists. */
  initials: string;
  name: string;
  /** "KO/TKO", "SUB", "UD" — or undefined for the fighter who lost. */
  method?: string;
};

/*
 * Result row, borrowed from how Real lists fight outcomes: the *method* is the
 * headline and the fighter's name sits small beneath it.
 *
 * That works here for a reason beyond looks — the lane predicts exactly this
 * value, so a pick and a result share one row shape. "KO/TKO · A. Pereira"
 * reads the same whether it's your call or what actually happened, which makes
 * comparing the two immediate.
 *
 * No card: these are read, not tapped, so they sit on the ground with a
 * hairline between them.
 */
export default function ResultRow({
  red,
  blue,
  meta,
  detail,
  points,
  verdict,
  verdictNote,
  index = 0,
  last = false,
}: {
  red: BoutSide;
  blue: BoutSide;
  /** "Final", "Live", "Open". */
  meta: string;
  /** "R2, 3:41" or "Locks in 14h". */
  detail?: string;
  points?: string;
  /** Whether your pick came in. Omit when there was no pick. */
  verdict?: "hit" | "miss" | "none";
  verdictNote?: string;
  index?: number;
  last?: boolean;
}) {
  const { c } = useTheme();

  const Side = ({ side, corner }: { side: BoutSide; corner: "red" | "blue" }) => {
    const accent = corner === "red" ? c.red : c.blue;
    const won = !!side.method;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: c.input,
            borderWidth: 1.5,
            borderColor: accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "800", color: c.textMuted }}>
            {side.initials}
          </Text>
        </View>
        <View>
          <Text
            style={{
              fontSize: won ? 16 : 14,
              fontWeight: won ? "800" : "700",
              letterSpacing: -0.3,
              color: won ? c.text : c.textFaint,
            }}
          >
            {side.method ?? "L"}
          </Text>
          <Text style={{ fontSize: 11.5, color: c.textMuted }}>{side.name}</Text>
        </View>
      </View>
    );
  };

  const badge =
    verdict === "hit"
      ? { bg: "rgba(46,204,113,0.14)", fg: c.green }
      : verdict === "miss"
        ? { bg: c.surface2, fg: c.textFaint }
        : null;

  return (
    <Animated.View
      entering={appear(index)}
      style={{
        flexDirection: "row",
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
        <Side side={red} corner="red" />
        <Side side={blue} corner="blue" />

        {badge && verdictNote && (
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: badge.bg,
              borderRadius: 5,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "800",
                letterSpacing: 0.6,
                color: badge.fg,
              }}
            >
              {verdictNote}
            </Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: c.text2 }}>{meta}</Text>
        {detail && (
          <Text style={{ fontSize: 11, color: c.blue, marginTop: 3 }}>{detail}</Text>
        )}
        {points && (
          <Text
            style={{
              fontSize: 11,
              color: c.textFaint,
              marginTop: 2,
              fontVariant: ["tabular-nums"],
            }}
          >
            {points}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
