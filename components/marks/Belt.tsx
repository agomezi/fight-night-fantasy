import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Title belt, on the classic UFC plate.
 *
 * Earlier passes drew the belt end to end — strap, plate, plate, plate,
 * strap — which spanned nearly the full grid and read as a long thin strip.
 * The fix wasn't the centre plate's proportions, it was the overall run.
 *
 * So the straps are gone and the mark is cropped to the three plates. That
 * shortens the silhouette by about a quarter and lets the centre plate grow
 * to carry the mark, which is what identifies the belt anyway — nobody
 * recognises a title from its leather.
 *
 * The plate is a wide hexagon: flat top and bottom, tapering to a point each
 * side. Angular, so it rhymes with the octagon used elsewhere in the app
 * rather than introducing a second geometry.
 *
 * Nothing overlaps — plates meet at gaps, because line art muddies wherever
 * two outlines run through each other.
 */
export default function Belt({
  size = 74,
  color,
  strokeWidth = 3.5,
}: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* side plates */}
      <Path
        d="M12 41 14.5 35h5l2.5 6-2.5 6h-5z"
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M58 41 60.5 35h5l2.5 6-2.5 6h-5z"
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* centre plate — 34 across, 28 tall, so it reads landscape */}
      <Path
        d="M23 41 31 27h18l8 14-8 14H31z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* gold panel inside it */}
      <Path
        d="M30 41 36 33h8l6 8-6 8H36z"
        fill={color}
        fillOpacity={0.9}
        stroke={color}
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
