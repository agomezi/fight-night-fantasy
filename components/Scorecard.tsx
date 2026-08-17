import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { useTheme } from "../context/ThemeContext";

/*
 * The scorecard idiom.
 *
 * Rule for the app: if you cannot tap it, it does not get a box. Figures are
 * read, not operated, so they lose the card entirely and become ruled rows —
 * the way a judge's scorecard is laid out. Values sit right-aligned so they
 * form a column the eye can run down, which a grid of bordered tiles prevents.
 */

export function Scorecard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}

export function ScoreRow({
  label,
  value,
  note,
  noteTone = "muted",
  index = 0,
  last = false,
}: {
  label: string;
  value: string;
  /** Trailing qualifier — a delta, a rank, a stable marker. */
  note?: string;
  noteTone?: "muted" | "up" | "down";
  index?: number;
  last?: boolean;
}) {
  const { c } = useTheme();
  const noteColor =
    noteTone === "up" ? c.green : noteTone === "down" ? c.red : c.textFaint;

  return (
    <Animated.View
      entering={appear(index)}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
      }}
    >
      <Text
        style={{
          flex: 1,
          color: c.textMuted,
          fontSize: 13,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        {note && (
          <Text style={{ color: noteColor, fontSize: 11, fontWeight: "700" }}>
            {note}
          </Text>
        )}
        <Text
          style={{
            color: c.text,
            fontSize: 17,
            fontWeight: "800",
            fontVariant: ["tabular-nums"],
            minWidth: 54,
            textAlign: "right",
          }}
        >
          {value}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * The blank card a fighter has before anything is scored. Ruled empty rows
 * rather than an icon and a sentence — it shows the shape of what is missing.
 */
export function EmptyScorecard({
  rows = 4,
  caption,
}: {
  rows?: number;
  caption?: string;
}) {
  const { c } = useTheme();
  return (
    <View>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingVertical: 14,
            borderBottomWidth: i === rows - 1 ? 0 : 1,
            borderBottomColor: c.border,
            opacity: 1 - i * 0.18,
          }}
        >
          <View
            style={{
              height: 9,
              width: `${52 - i * 7}%`,
              borderRadius: 2,
              backgroundColor: c.border,
            }}
          />
          <Text
            style={{
              color: c.textFaint,
              fontSize: 17,
              fontWeight: "800",
              fontVariant: ["tabular-nums"],
            }}
          >
            —
          </Text>
        </View>
      ))}
      {caption && (
        <Text
          style={{
            color: c.textFaint,
            fontSize: 12,
            lineHeight: 18,
            marginTop: 14,
          }}
        >
          {caption}
        </Text>
      )}
    </View>
  );
}
