import { Path, Rect, Svg } from "react-native-svg";

/*
 * Picks tab.
 *
 * Two shapes, nothing else. The nav needs a silhouette that survives 22px —
 * the lane version had cell divisions and a marker inside a 20px box, which
 * turned to mush at that size, and the crosshair before it described aiming
 * rather than calling a result.
 *
 * A card with a check on it: "card" is the real word for the night's slate of
 * fights, and the check is the pick made against it.
 */
export default function PicksCard({
  size = 22,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3.25}
        y={3.25}
        width={17.5}
        height={17.5}
        rx={4}
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M7.75 12.25 10.75 15.25 16.5 9"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
