import Svg, { Circle, Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Title belt.
 *
 * A real belt is one big round plate with the strap running out of either
 * side — not a bar with a shield stuck on it, which is what the first attempt
 * drew and why it looked wrong.
 *
 * The straps stop exactly where the plate begins, so no outlines cross. Line
 * art goes muddy the moment shapes overlap without a fill to hide the seam.
 *
 * The plate carries the octagon, so the belt belongs to this app rather than
 * being a generic championship graphic.
 */
export default function Belt({ size = 74, color, strokeWidth = 3.5 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* straps, meeting the plate at its widest point */}
      <Path
        d="M5 34.5h20v13H5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M55 34.5h20v13H55z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* plate */}
      <Circle cx={40} cy={41} r={16} stroke={color} strokeWidth={strokeWidth} />

      {/* the cage, on the plate */}
      <Path
        d="M48.3 44.4 43.4 49.3H36.6L31.7 44.4V37.6L36.6 32.7h6.8L48.3 37.6z"
        stroke={color}
        strokeWidth={strokeWidth * 0.72}
        strokeLinejoin="round"
        opacity={0.75}
      />
    </Svg>
  );
}
