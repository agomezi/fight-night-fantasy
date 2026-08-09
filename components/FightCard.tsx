import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * Card treatment: fight bill, not app card.
 *
 * The generic shape — rounded rect, 1px border all round, flat fill — is what
 * every app ships, so it reads as templated in any palette. This is built from
 * printed fight bills and ticket stubs instead.
 *
 * The header does the work:
 *   · a hazard-striped band, the way a poster or a ticket edge is banded
 *   · the label stamped into it, notched so it interrupts the stripes rather
 *     than floating above them
 *   · a serial on the right, set small in mono — the detail that makes
 *     printed matter feel issued rather than designed
 *
 * Below that, an oversized ghosted line of type — fighter names, a rank — and
 * a clipped bottom-right corner like a torn stub.
 *
 * The middle stays plain on purpose: when fighter art lands, every device here
 * is at the edges, so the frame holds the image instead of competing with it.
 */

/** Diagonal hazard stripes, clipped to the band. */
function StripeBand({ color, height = 9 }: { color: string; height?: number }) {
  const bars = Array.from({ length: 34 });
  return (
    <View
      style={{
        height,
        backgroundColor: color,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      {bars.map((_, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: height * 3,
            marginTop: -height,
            marginRight: 9,
            backgroundColor: "rgba(0,0,0,0.42)",
            transform: [{ rotate: "24deg" }],
          }}
        />
      ))}
    </View>
  );
}

export default function FightCard({
  label,
  labelColor,
  serial,
  watermark,
  children,
  style,
  minHeight,
}: {
  label: string;
  /** Drives the band and the stamp. */
  labelColor: string;
  /** Small mono text on the right of the header — issue number, date, round. */
  serial?: string;
  /** Oversized ghost type behind the content. Supports a newline for two lines. */
  watermark?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const { c } = useTheme();
  const NOTCH = 22;
  const lines = watermark?.split("\n") ?? [];

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 4,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          minHeight,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <StripeBand color={labelColor} />

      {/* ghosted type, sitting behind everything */}
      {lines.length > 0 && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", right: -6, top: 18, alignItems: "flex-end" }}
        >
          {lines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              style={{
                fontFamily: "BebasNeue",
                fontSize: lines.length > 1 ? 62 : 108,
                lineHeight: lines.length > 1 ? 58 : 116,
                letterSpacing: -1,
                color: c.text,
                opacity: 0.05,
              }}
            >
              {line}
            </Text>
          ))}
        </View>
      )}

      {/* stamped label, notched into the band */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingRight: 14,
        }}
      >
        <View
          style={{
            backgroundColor: labelColor,
            paddingHorizontal: 11,
            paddingVertical: 5,
            borderBottomRightRadius: 4,
          }}
        >
          <Text
            style={{
              color: "#0A0A0A",
              fontSize: 9.5,
              fontWeight: "900",
              letterSpacing: 1.4,
            }}
          >
            {label}
          </Text>
        </View>

        {serial && (
          <Text
            style={{
              color: c.textFaint,
              fontSize: 9.5,
              letterSpacing: 1,
              fontVariant: ["tabular-nums"],
            }}
          >
            {serial}
          </Text>
        )}
      </View>

      <View style={{ padding: 20, paddingTop: 16, flex: 1 }}>{children}</View>

      {/* torn corner */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -NOTCH / 2,
          bottom: -NOTCH / 2,
          width: NOTCH,
          height: NOTCH,
          backgroundColor: c.bg,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}
