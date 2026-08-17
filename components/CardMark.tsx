import { View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Belt, Bell, Glove, Octagon, Trophy } from "./svg/marks";

/*
 * Positions a mark faintly behind a card's content.
 *
 * The drawing itself lives in components/svg/marks — this only decides where it
 * sits and how quiet it is. Keeping those apart means a mark can be used at
 * full strength elsewhere (the octagon is the home tab icon) without any of
 * this card-specific placement following it around.
 *
 * A mark says what kind of card you're looking at before any reading happens,
 * and unlike the ghosted numeral it replaced, it can never duplicate the value
 * printed inside the card.
 */

export type MarkName = "trophy" | "octagon" | "belt" | "bell" | "glove";

const MARKS = {
  trophy: Trophy,
  octagon: Octagon,
  belt: Belt,
  bell: Bell,
  glove: Glove,
} as const;

export default function CardMark({
  name,
  color,
  accent,
  size = 74,
  opacity = 0.11,
  right = 20,
  top = 58,
}: {
  name: MarkName;
  /** Highlight colour for marks that have one — the belt plate. */
  accent?: string;
  /** Defaults to the card's own text colour. */
  color?: string;
  size?: number;
  opacity?: number;
  right?: number;
  top?: number;
}) {
  const { c } = useTheme();
  const Mark = MARKS[name];

  return (
    <View pointerEvents="none" style={{ position: "absolute", right, top, opacity }}>
      <Mark size={size} color={color ?? c.text} accent={accent} />
    </View>
  );
}
