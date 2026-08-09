import Svg, { Circle, Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Title belt, on the classic UFC silhouette.
 *
 * The thing that makes that belt readable at a glance isn't the centre plate
 * on its own — it's the run of five: strap, side plate, centre plate, side
 * plate, strap. Earlier passes drew only the middle and looked like a buckle.
 *
 * Everything sits on one horizontal axis and nothing overlaps, because line
 * art muddies the moment two outlines cross with no fill to hide the seam.
 *
 * The inner disc is filled rather than outlined, which gives the mark a solid
 * centre to read against at small sizes and echoes the coloured medallion on
 * the real thing.
 */
export default function Belt({ size = 74, color, strokeWidth = 3.5 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* strap ends */}
      <Path
        d="M2 35.5h7v11H2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M71 35.5h7v11h-7z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* side plates */}
      <Circle cx={16.5} cy={41} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={63.5} cy={41} r={8} stroke={color} strokeWidth={strokeWidth} />

      {/* centre plate */}
      <Circle cx={40} cy={41} r={15.5} stroke={color} strokeWidth={strokeWidth} />

      {/* filled medallion */}
      <Circle
        cx={40}
        cy={41}
        r={8.5}
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={strokeWidth * 0.7}
      />
    </Svg>
  );
}
