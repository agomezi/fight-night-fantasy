import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * Card treatment: fight bill, not app card.
 *
 * The generic version — rounded rect, 1px border all round, flat fill — is the
 * default shape every app ships, which is why it reads as templated no matter
 * what colour it is. This borrows from printed fight bills and ticket stubs
 * instead:
 *
 *   · square-ish corners (4px), because posters aren't rounded
 *   · a solid rule across the top in the card's own colour, the way a printed
 *     header band sits above the bill
 *   · the label as a stamped block hanging off that rule, not floating text
 *   · an oversized ghosted numeral behind the content — the event number, set
 *     huge and nearly invisible, which is pure poster language
 *   · a clipped bottom-right corner, like a torn ticket
 *
 * The frame is deliberately empty in the middle so fighter art can sit inside
 * it later without the treatment fighting the image.
 */
export default function FightCard({
  label,
  labelColor,
  watermark,
  children,
  style,
  minHeight,
}: {
  label: string;
  /** Drives the header rule and the stamp. */
  labelColor: string;
  /** Oversized ghost text behind the content — usually the event number. */
  watermark?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const { c } = useTheme();
  const NOTCH = 22;

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
      {/* printed header band */}
      <View style={{ height: 3, backgroundColor: labelColor }} />

      {/* ghosted event numeral */}
      {watermark && (
        <Text
          pointerEvents="none"
          numberOfLines={1}
          style={{
            position: "absolute",
            right: -8,
            top: 6,
            fontFamily: "BebasNeue",
            fontSize: 118,
            lineHeight: 128,
            letterSpacing: -2,
            color: c.text,
            opacity: 0.045,
          }}
        >
          {watermark}
        </Text>
      )}

      {/* stamped label, hanging off the band */}
      <View style={{ flexDirection: "row" }}>
        <View
          style={{
            backgroundColor: labelColor,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderBottomRightRadius: 3,
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
