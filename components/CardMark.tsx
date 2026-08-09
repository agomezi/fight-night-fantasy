import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
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

export type MarkName = "trophy" | "octagon" | "bell" | "glove" | "belt";

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

/** The cage itself — reads as "an event happened here". */
function OctagonPath({ color }: { color: string }) {
  return (
    <>
      <Path
        d="M67.7 51.5 51.5 67.7H28.5L12.3 51.5V28.5L28.5 12.3h23L67.7 28.5z"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      {/* canvas edge inside the fence */}
      <Path
        d="M57.6 47.3 47.3 57.6H32.7L22.4 47.3V32.7L32.7 22.4h14.6l10.3 10.3z"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        opacity={0.6}
      />
    </>
  );
}

/** The round bell — an event was fought, and the bell marked it. */
function BellPath({ color }: { color: string }) {
  return (
    <>
      {/* mount and stem */}
      <Path d="M31 11h18M40 11v7" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
      {/* dome */}
      <Path
        d="M23 50c0-19 5-32 17-32s17 13 17 32"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      {/* rim */}
      <Path d="M17 50h46" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
      {/* clapper */}
      <Path d="M40 50v6" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
      <Circle cx={40} cy={63} r={5.5} fill="none" stroke={color} strokeWidth={3.5} />
    </>
  );
}

function GlovePath({ color }: { color: string }) {
  return (
    <>
      {/* mitt */}
      <Path
        d="M23 28c0-11 8-18 18-18s20 8 20 20v12c0 6-4 10-10 10H31c-5 0-8-4-8-9V28z"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      {/* thumb */}
      <Path
        d="M23 33c-6 0-10 5-10 11s4 8 9 8"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      {/* cuff */}
      <Path
        d="M28 52h27l2 14c0 3-2 5-5 5H32c-3 0-5-2-5-5l1-14z"
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      {/* strap */}
      <Path d="M34 60h16" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
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
  size = 74,
  opacity = 0.11,
  right = 20,
  top = 58,
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
        {name === "octagon" && <OctagonPath color={stroke} />}
        {name === "bell" && <BellPath color={stroke} />}
        {name === "glove" && <GlovePath color={stroke} />}
        {name === "belt" && <BeltPath color={stroke} />}
      </Svg>
    </View>
  );
}
