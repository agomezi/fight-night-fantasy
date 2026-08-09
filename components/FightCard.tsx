import { ReactNode } from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * Card treatment: two zones, not one box.
 *
 * The generic card is a single flat fill with a 1px border all round — one
 * undifferentiated area, which is why it reads as a container rather than an
 * object. This splits the card into a header plate and a body, stepped in
 * value, divided by a hairline.
 *
 * That does three things: it gives the label somewhere to belong instead of
 * floating over the content, it makes the card look constructed rather than
 * drawn, and it reserves a zone that fighter art can move into later without
 * any restyling — the plate simply becomes the image.
 *
 * A short accent tab marks the plate. That's the only colour on the frame;
 * everything else is value and spacing.
 */
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
  /** Colours the tab. Deliberately the only hue on the frame. */
  labelColor: string;
  /** Quiet right-hand text on the plate — event, week, lock time. */
  serial?: string;
  /** Oversized ghost type behind the body. Newline gives two lines. */
  watermark?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}) {
  const { c } = useTheme();
  const lines = watermark?.split("\n") ?? [];

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 14,
          minHeight,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {/* header plate — steps up in value, and is where art will live */}
      <View
        style={{
          backgroundColor: c.surface2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 14,
          paddingRight: 16,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View
            style={{
              width: 3,
              height: 13,
              borderRadius: 2,
              backgroundColor: labelColor,
            }}
          />
          <Text
            style={{
              color: c.text2,
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 1.3,
            }}
          >
            {label}
          </Text>
        </View>

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

      {/* body */}
      <View style={{ padding: 20, flex: 1 }}>
        {lines.length > 0 && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", right: -4, top: 4, alignItems: "flex-end" }}
          >
            {lines.map((line, i) => (
              <Text
                key={i}
                numberOfLines={1}
                style={{
                  fontFamily: "BebasNeue",
                  fontSize: lines.length > 1 ? 56 : 96,
                  lineHeight: lines.length > 1 ? 53 : 104,
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

        {children}
      </View>
    </View>
  );
}
