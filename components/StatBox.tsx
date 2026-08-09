import { StyleSheet, Text, View } from "react-native";
import { Palette } from "../constants/palette";
import { useThemedStyles } from "../context/ThemeContext";

type StatBoxProps = {
  value?: string;
  label?: string;
  accent?: boolean;
  highlighted?: boolean;
  icon?: React.ReactNode;
};

export function StatBoxRow({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={inline ? styles.rowInline : styles.row}>{children}</View>;
}

export function StatBox({
  value,
  label,
  accent,
  highlighted,
  icon,
}: StatBoxProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.box, highlighted && styles.boxHighlighted]}>
      {icon ? (
        <View style={styles.iconWrapper}>{icon}</View>
      ) : (
        <Text style={[styles.value, accent && styles.valueAccent]}>
          {value}
        </Text>
      )}
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      flex: 1,
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },

    boxHighlighted: {
      backgroundColor: c.red,
      borderColor: c.red,
    },

    iconWrapper: {
      marginBottom: 4,
    },

    value: {
      fontSize: 36,
      fontWeight: "bold",
      color: c.text,
    },

    valueAccent: {
      color: c.red,
    },

    label: {
      fontSize: 11,
      color: c.textMuted,
      letterSpacing: 1.5,
      marginTop: 2,
    },

    row: {
      position: "absolute",
      bottom: 16,
      left: 16,
      right: 16,
      flexDirection: "row",
      gap: 12,
    },
    rowInline: {
      flexDirection: "row",
      gap: 12,
      marginTop: 14,
    },
  });

export default StatBox;
