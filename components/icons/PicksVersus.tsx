import { Path, Svg } from "react-native-svg";

/*
 * Picks tab.
 *
 * The versus, with a side taken.
 *
 * Two wedges facing each other across a gap — the shape of every matchup in
 * the sport. The left one is solid and the right hollow, so the mark isn't
 * just "two fighters", it's "one of them called". That's the action the tab
 * leads to.
 *
 * Two shapes and one gap, which is all 22px supports. Earlier attempts
 * failed on that: the crosshair described aiming rather than calling a
 * result, the lane packed cells and a marker into a 20px box, and the card
 * with a check was legible but generic — a checkbox, not a fight.
 */
export default function PicksVersus({
  size = 22,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* your side — taken */}
      <Path
        d="M4 4.5 11 12 4 19.5z"
        fill={color}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* the other corner — open */}
      <Path
        d="M20 4.5 13 12 20 19.5z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
