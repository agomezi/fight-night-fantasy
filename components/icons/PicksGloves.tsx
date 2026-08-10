import { G, Rect, Svg } from "react-native-svg";

/*
 * Picks tab — an MMA glove, fist forward.
 *
 * Two corrections from the reference, and both matter.
 *
 * It's an MMA glove, not a boxing glove: open-fingered, worn in the sport
 * this app is actually about. Every earlier attempt drew a boxing mitt.
 *
 * And it faces forward. A glove in profile needs its outline to read, which
 * is exactly what dies at 22px. A fist head-on is a compact mass with a few
 * separations cut through it, and separations survive shrinking in a way
 * that a traced contour does not.
 *
 * Proportion matters more than detail here: the fist stands 9.2 tall against
 * about 5 of visible finger above it. An earlier pass had those the other way
 * round and the icon read as a hand of fingers with no palm.
 *
 * Everything is a filled rounded rectangle. Fingers and palm overlap so the
 * fills merge into one silhouette with no seams; the gaps between fingers
 * and above the strap are negative space, left by not drawing there rather
 * than by stroking a line. Nothing here can go subtly wrong the way a
 * hand-written path can — which it did, five times.
 */
export default function PicksGloves({
  size = 22,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(-6 12 12)">
        {/* three fingers — three, not four, so the gaps stay visible at size */}
        <Rect x={5.8} y={3.4} width={3.6} height={9.2} rx={1.6} fill={color} />
        <Rect x={10.6} y={3} width={3.6} height={9.6} rx={1.6} fill={color} />
        <Rect x={15.4} y={3.7} width={3.6} height={8.9} rx={1.6} fill={color} />

        {/* thumb, tucked at the side */}
        <Rect x={2.6} y={10.4} width={3.8} height={6.4} rx={1.9} fill={color} />

        {/* the fist itself */}
        <Rect x={5.2} y={8.4} width={15} height={9.2} rx={2.8} fill={color} />

        {/* wrist strap, held off the fist so the gap reads */}
        <Rect x={6.3} y={19} width={13} height={3} rx={1.5} fill={color} />
      </G>
    </Svg>
  );
}
