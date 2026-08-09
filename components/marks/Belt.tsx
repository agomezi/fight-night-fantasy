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
export default function Belt({ size = 74, color, strokeWidth = 3.5 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* strap ends */}
      <Path
        d="M2 37.5h5v7H2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M73 37.5h5v7h-5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* side plates */}
      <Path
        d="M8 41 11 35h7l3 6-3 6h-7z"
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M59 41 62 35h7l3 6-3 6h-7z"
        fill={color}
        fillOpacity={0.3}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* centre plate — outlined, 36 across by 24 tall so it reads landscape */}
      <Path
        d="M22 41 30 29h20l8 12-8 12H30z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* filled panel inside it */}
      <Path
        d="M29 41 35 34h10l6 7-6 7H35z"
        fill={color}
        fillOpacity={0.9}
        stroke={color}
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
