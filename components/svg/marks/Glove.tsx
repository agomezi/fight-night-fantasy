import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/** Unused at present — kept for a picks or fighter context. */
export default function Glove({ size = 74, color, strokeWidth = 3.5 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* mitt */}
      <Path
        d="M23 28c0-11 8-18 18-18s20 8 20 20v12c0 6-4 10-10 10H31c-5 0-8-4-8-9V28z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* thumb */}
      <Path
        d="M23 33c-6 0-10 5-10 11s4 8 9 8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* cuff */}
      <Path
        d="M28 52h27l2 14c0 3-2 5-5 5H32c-3 0-5-2-5-5l1-14z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M34 60h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
