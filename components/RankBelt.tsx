import { View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { CareerRank } from "../services/career";

/** Belt colours in BJJ order, one per career rank. */
const BELTS: Record<CareerRank, { body: string; tip: string }> = {
  Prospect: { body: "#ececec", tip: "#111111" },
  Contender: { body: "#2f6fd6", tip: "#111111" },
  Ranked: { body: "#7b3fc4", tip: "#111111" },
  "Title Challenger": { body: "#7a4a24", tip: "#111111" },
  Champion: { body: "#1b1b1b", tip: "#E8003D" },
  Legend: { body: "#E8003D", tip: "#111111" },
};

/** Your career rank as a belt; the stripes on its tip show how close the next
 * rank is. Scales with `width`. */
export default function RankBelt({ rank, stripes, width = 140 }: { rank: CareerRank; stripes: number; width?: number }) {
  const { c } = useTheme();
  const k = width / 140;
  const belt = BELTS[rank];
  const height = Math.max(6, Math.round(12 * k));
  return (
    <View
      accessibilityLabel={`${rank} belt${stripes ? `, ${stripes} stripe${stripes === 1 ? "" : "s"}` : ""}`}
      style={{
        width,
        height,
        borderRadius: 2,
        backgroundColor: belt.body,
        // The white and black belts need an edge to show on a matching card.
        borderWidth: rank === "Prospect" || rank === "Champion" ? 1 : 0,
        borderColor: c.borderStrong,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", right: 10 * k, top: 0, bottom: 0, width: 34 * k, backgroundColor: belt.tip }}>
        {Array.from({ length: stripes }, (_, i) => (
          <View
            key={i}
            testID="belt-stripe"
            style={{ position: "absolute", top: 0, bottom: 0, left: (6 + i * 7) * k, width: Math.max(2, 3 * k), backgroundColor: "#f4f4f4" }}
          />
        ))}
      </View>
    </View>
  );
}
