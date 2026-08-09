import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Palette } from "../constants/palette";
import { useThemedStyles } from "../context/ThemeContext";

/*
 * Tale of the tape.
 *
 * These were three bordered squares — the generic dashboard tile, and the
 * same shape whether they held a countdown or a fighter's reach. Boxing every
 * figure also broke the rule the rest of the app follows: if you can't tap
 * it, it doesn't get a container.
 *
 * So the boxes are gone. Figures sit in columns divided by hairline rules,
 * the way a tale of the tape is set on a fight card — which is exactly what
 * these are. Values lead at size, labels sit under them small and tracked.
 *
 * Same component drives the countdown and the fighter spotlight, so both
 * read as the same kind of information.
 */

type StatBoxProps = {
  value?: string;
  label?: string;
  /** Colours the value — used for the figure that matters most. */
  accent?: boolean;
  icon?: React.ReactNode;
  /** Set by the row; not passed by hand. */
  last?: boolean;
};

export function StatBoxRow({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const items = React.Children.toArray(children);

  return (
    <View style={inline ? styles.rowInline : styles.row}>
      {items.map((child, i) =>
        React.isValidElement<StatBoxProps>(child)
          ? React.cloneElement(child, { last: i === items.length - 1 })
          : child,
      )}
    </View>
  );
}

export function StatBox({ value, label, accent, icon, last }: StatBoxProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.column, !last && styles.divided]}>
      {icon ? (
        <View style={styles.iconWrapper}>{icon}</View>
      ) : (
        <Text style={[styles.value, accent && styles.valueAccent]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {label && (
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    column: {
      flex: 1,
      paddingHorizontal: 4,
    },
    // The rule between columns, not around them.
    divided: {
      borderRightWidth: 1,
      borderRightColor: c.border,
    },

    iconWrapper: {
      marginBottom: 6,
    },

    value: {
      fontSize: 27,
      fontWeight: "800",
      letterSpacing: -1,
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    valueAccent: {
      color: c.red,
    },

    label: {
      fontSize: 9.5,
      fontWeight: "700",
      color: c.textFaint,
      letterSpacing: 1.1,
      marginTop: 3,
      lineHeight: 13,
    },

    row: {
      position: "absolute",
      bottom: 16,
      left: 16,
      right: 16,
      flexDirection: "row",
    },
    rowInline: {
      flexDirection: "row",
      marginTop: 16,
    },
  });

export default StatBox;
