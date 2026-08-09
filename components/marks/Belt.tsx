import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Title belt, on the classic UFC plate.
 *
 * Five pieces on one axis: strap, side plate, centre plate, side plate,
 * strap. The full run is what identifies it — cropping to the plates alone
 * loses the belt and leaves three badges.
 *
 * The plates are wide hexagons, flat top and bottom tapering to a point each
 * side, so the mark is angular and rhymes with the octagon used elsewhere in
 * the app rather than introducing a second geometry.
 *
 * Everything draws in one colour from the theme — see `gold` in the palette,
 * which shifts between themes because a pale gold vanishes on a white card.
 *
 * Nothing overlaps: pieces meet at gaps rather than crossing, because line
 * art muddies wherever two outlines run through each other.
 */
export default function Belt({
  size = 74,
  color,
  accent,
  strokeWidth = 3.5,
}: MarkProps) {
  const plate = accent ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* strap ends */}
      <Path
        d="M9 37.5h4v7H9z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M67 37.5h4v7h-4z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* side plates */}
      <Path
        d="M14 41 16.5 35h5l2.5 6-2.5 6h-5z"
        fill={plate}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M56 41 58.5 35h5l2.5 6-2.5 6h-5z"
        fill={plate}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* centre plate — outlined, 30 across by 24 tall so it reads landscape */}
      <Path
        d="M25 41 32 29h16l7 12-7 12H32z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* filled panel inside it */}
      <Path
        d="M31 41 36 34h8l5 7-5 7H36z"
        fill={plate}
        fillOpacity={0.95}
        stroke={plate}
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
