import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * Card treatment, fourth pass: the ruled header from the last one, the torn
 * corner from the first, and a media zone that fighter art moves into.
 *
 * Three devices, all from print rather than app UI:
 *
 * 1. Header — the label sits, then a hairline rule runs the remaining width
 *    to meet a right-hand serial. Type interrupting a rule is a masthead
 *    device; it reads as typeset rather than boxed, and costs no fill, border
 *    or colour block.
 *
 * 2. Base — a heavier bottom edge than the sides. Physical cards have
 *    thickness, and a uniform 1px outline on all four sides is exactly what
 *    makes a card look drawn instead of made.
 *
 * 3. Torn corner — the bottom-right is clipped, like a stub pulled from a
 *    book. It's the one asymmetry, which is what stops the shape reading as a
 *    plain rounded rectangle.
 *
 * `media` sits full-bleed between header and body: today a pair of tinted
 * fighter wells, later the actual PNGs, with no change to anything else.
 */
export default function FightCard({
  label,
  labelColor,
  serial,
  media,
  children,
  style,
  minHeight,
}: {
  label: string;
  /** Tints the label only — the frame carries no colour of its own. */
  labelColor: string;
  /** Right-hand text the rule runs into — event, week, lock time. */
  serial?: string;
  /** Full-bleed zone under the header. Where fighter art lives. */
  media?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const { c } = useTheme();
  const NOTCH = 26;

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 12,
          borderBottomWidth: 3,
          borderBottomColor: c.borderStrong,
          minHeight,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 18,
          paddingTop: 16,
        }}
      >
        <Text
          style={{
            color: labelColor,
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 1.3,
          }}
        >
          {label}
        </Text>

        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />

        {serial && (
          <Text
            style={{
              color: c.textFaint,
              fontSize: 10,
              letterSpacing: 0.8,
              fontVariant: ["tabular-nums"],
            }}
          >
            {serial}
          </Text>
        )}
      </View>

      {media && <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>{media}</View>}

      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: media ? 12 : 14,
          paddingBottom: 18,
          flex: 1,
        }}
      >
        {children}
      </View>

      {/* torn corner — the one asymmetry in the shape */}
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
