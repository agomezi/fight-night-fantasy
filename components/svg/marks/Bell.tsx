import Svg, { Circle, Path } from "react-native-svg";
import { MarkProps } from "./types";

/** The round bell. Unused at present — kept for a live or timing context. */
export default function Bell({ size = 74, color, strokeWidth = 3.5 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Path
        d="M31 11h18M40 11v7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M23 50c0-19 5-32 17-32s17 13 17 32"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M17 50h46" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M40 50v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={40} cy={63} r={5.5} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
