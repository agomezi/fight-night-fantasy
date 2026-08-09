import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Title belt, on the classic UFC plate.
 *
 * The silhouette that actually identifies that belt is a wide hexagon —
 * flat top and bottom, tapering to a point at each side — repeated smaller
 * for the two side plates, with strap showing at the ends. Circles were
 * wrong; the real plate is angular, and it rhymes with the octagon the rest
 * of the app already uses.
 *
 * The inner panel is filled gold, which is the one warm note on the mark and
 * the thing that reads first at low opacity.
 *
 * Nothing overlaps: plates and straps meet at gaps rather than crossing,
 * because line art muddies wherever two outlines run through each other.
 */
export default function Belt({
  size = 74,
  color,
  strokeWidth = 3.5,
  /** The plate fill. Warm by default, matching the trophy. */
  gold = "#F2BE42",
}: MarkProps & { gold?: string }) {
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

      {/* side plates — same hexagon, scaled down */}
      <Path
        d="M8 41 11 35h7l3 6-3 6h-7z"
        fill={gold}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M59 41 62 35h7l3 6-3 6h-7z"
        fill={gold}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* centre plate */}
      <Path
        d="M22 41 30 29h20l8 12-8 12H30z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* gold panel inside it */}
      <Path
        d="M29 41 35 34h10l6 7-6 7H35z"
        fill={gold}
        fillOpacity={0.82}
        stroke={gold}
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
