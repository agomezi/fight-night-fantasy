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
        d="M2 37h7v8H2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M71 37h7v8h-7z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* side plates — same hexagon, scaled down */}
      <Path
        d="M11 41 14.5 34h7L25 41l-3.5 7h-7z"
        fill={gold}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M55 41 58.5 34h7L69 41l-3.5 7h-7z"
        fill={gold}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* centre plate */}
      <Path
        d="M27 41 33.5 27h13L53 41l-6.5 14h-13z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* gold panel inside it */}
      <Path
        d="M32.5 41 37 33h6l4.5 8-4.5 8h-6z"
        fill={gold}
        fillOpacity={0.82}
        stroke={gold}
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
