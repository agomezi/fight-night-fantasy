import { StyleSheet, Text, View } from "react-native";

type StatBoxProps = {
  value?: string;
  label?: string;
  accent?: boolean;
  highlighted?: boolean;
  icon?: React.ReactNode;
};

export function StatBoxRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function StatBox({
  value,
  label,
  accent,
  highlighted,
  icon,
}: StatBoxProps) {
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

const styles = StyleSheet.create({
  box: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#333333",
    borderRadius: 8,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },

  boxHighlighted: {
    backgroundColor: "#E8003D",
    borderColor: "#E8003D",
  },

  iconWrapper: {
    marginBottom: 4,
  },

  value: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  valueAccent: {
    color: "#E8003D",
  },

  label: {
    fontSize: 11,
    color: "#888888",
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
});

export default StatBox;
