import { Path, Rect, Svg } from "react-native-svg";

/*
 * Picks tab.
 *
 * The crosshair never fit — a sight is about aiming, and picking a fight is
 * about calling where it ends. This is the round lane itself: cells across,
 * one filled where the marker sits. The tab is the mechanic.
 */
export default function PicksLane({
  size = 22,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* the lane */}
      <Rect
        x={2}
        y={7}
        width={20}
        height={10}
        rx={2.5}
        stroke={color}
        strokeWidth={2}
      />
      {/* cell divisions */}
      <Path d="M9 7v10M16 7v10" stroke={color} strokeWidth={2} />
      {/* the marker */}
      <Rect x={9} y={7} width={7} height={10} fill={color} />
    </Svg>
  );
}
