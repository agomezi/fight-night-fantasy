import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

/*
 * A large, faint graphic sitting behind a card's content.
 *
 * This replaces the ghosted numeral, which just restated the value printed
 * two lines below it. A mark says what *kind* of card this is at a glance —
 * silhouette first, before any reading happens — and it never duplicates the
 * data.
 *
 * Drawn rather than taken from an icon set, so the weight and proportions
 * match across marks and nothing looks borrowed.
 */

export type MarkName = "trophy" | "scorecard" | "belt";

function TrophyPath({ color }: { color: string }) {
  return (
    <>
      {/* cup */}
      <Path
        d="M24 10h32v20c0 8.8-7.2 16-16 16s-16-7.2-16-16V10z"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* handles */}
      <Path
        d="M24 14h-8a8 8 0 0 0 8 8M56 14h8a8 8 0 0 1-8 8"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* stem and base */}
      <Path
        d="M40 46v10M28 66h24M32 56h16l4 10H28l4-10z"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ScorecardPath({ color }: { color: string }) {
  return (
    <>
      <Rect
        x={14}
        y={10}
        width={52}
        height={60}
        rx={4}
        fill="none"
        stroke={color}
        strokeWidth={3}
      />
      {/* ruled rows, the way a judge's card is ruled */}
      <Path
        d="M24 26h32M24 38h32M24 50h20"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* tally through the last row */}
      <Path
        d="M46 44l12 12M58 44L46 56"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </>
  );
}

function BeltPath({ color }: { color: string }) {
  return (
    <>
      <Path
        d="M6 30h68v20H6z"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* centre plate */}
      <Path
        d="M28 22h24l6 18-6 18H28l-6-18 6-18z"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path d="M40 32v16M34 40h12" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

export default function CardMark({
  name,
  color,
  size = 132,
  opacity = 0.09,
  right = -18,
  top = -6,
}: {
  name: MarkName;
  /** Defaults to the card's own text colour. */
  color?: string;
  size?: number;
  opacity?: number;
  right?: number;
  top?: number;
}) {
  const { c } = useTheme();
  const stroke = color ?? c.text;

  return (
    <View pointerEvents="none" style={{ position: "absolute", right, top, opacity }}>
      <Svg width={size} height={size} viewBox="0 0 80 80">
        {name === "trophy" && <TrophyPath color={stroke} />}
        {name === "scorecard" && <ScorecardPath color={stroke} />}
        {name === "belt" && <BeltPath color={stroke} />}
      </Svg>
    </View>
  );
}
