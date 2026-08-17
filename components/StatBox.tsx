import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Palette } from "../constants/palette";
import { useThemedStyles } from "../context/ThemeContext";

/*
 * Recessed wells.
 *
 * Third pass. Bordered squares read as generic dashboard tiles; bare ruled
 * columns lost too much weight and the figures stopped feeling like they
 * belonged to anything.
 *
 * These sit *into* the card instead of on top of it — a darker inset with no
 * border, so the depth reads as a well rather than another stacked box. The
 * card stays the object; the figures are punched into it.
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
      backgroundColor: c.inset,
      borderRadius: 10,
      paddingVertical: 13,
      paddingHorizontal: 12,
    },
    // Gap between wells is handled by the row, so nothing draws a divider.
    divided: {
      marginRight: 8,
    },

    iconWrapper: {
      marginBottom: 6,
    },

    value: {
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.8,
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    valueAccent: {
      color: c.red,
    },

    label: {
      fontSize: 9.5,
      fontWeight: "700",
      color: c.textMuted,
      letterSpacing: 1,
      marginTop: 4,
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
