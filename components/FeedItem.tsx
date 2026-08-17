import { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { appear } from "../constants/motion";
import { getInitials } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";

/*
 * The feed idiom.
 *
 * Social content is a stream, not a set of objects, so it loses the card and
 * the border. Identity sits flush left, text runs to the edge, and time is a
 * quiet trailing note. Boxing every message is what made chatter, risers and
 * activity read as the same component as the stats.
 */
export default function FeedItem({
  name,
  meta,
  body,
  trailing,
  index = 0,
  last = false,
}: {
  name: string;
  /** Timestamp, movement, or whatever qualifies the entry. */
  meta?: string;
  body?: string;
  /** Right-hand figure — a delta, a score. */
  trailing?: ReactNode;
  index?: number;
  last?: boolean;
}) {
  const { c } = useTheme();

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
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: c.surface2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "800" }}>
          {getInitials(name)}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 13.5, fontWeight: "700" }}>
            {name}
          </Text>
          {meta && (
            <Text style={{ color: c.textFaint, fontSize: 11 }}>{meta}</Text>
          )}
        </View>
        {body && (
          <Text
            style={{
              color: c.text2,
              fontSize: 13.5,
              lineHeight: 19,
              marginTop: 3,
            }}
          >
            {body}
          </Text>
        )}
      </View>

      {trailing}
    </Animated.View>
  );
}
