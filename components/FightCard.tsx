import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * Card treatment: ruled header, weighted base.
 *
 * Two devices, both from print rather than app UI:
 *
 * 1. The header sets the label, then a hairline rule runs across the
 *    remaining width to meet a right-hand serial. Type interrupting a rule is
 *    a masthead device — it reads as typeset rather than boxed, and it costs
 *    no fill, no border and no colour block.
 *
 * 2. The base carries a heavier edge than the sides. Physical cards have
 *    thickness; a uniform 1px outline on all four sides is the thing that
 *    makes a card look drawn instead of made.
 *
 * No ghosted watermark. Restating a figure that's already printed two lines
 * below it is noise, and the space is better spent on real content.
 */
export default function FightCard({
  label,
  labelColor,
  serial,
  children,
  style,
  minHeight,
}: {
  label: string;
  /** Tints the label only — the frame itself carries no colour. */
  labelColor: string;
  /** Right-hand text the rule runs into — event, week, lock time. */
  serial?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const { c } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 12,
          borderBottomWidth: 3,
          borderBottomColor: c.borderStrong,
          minHeight,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {/* label — rule — serial, all on one baseline */}
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

      <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, flex: 1 }}>
        {children}
      </View>
    </View>
  );
}
