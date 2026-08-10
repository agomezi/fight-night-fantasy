import { Path, Rect, Svg } from "react-native-svg";

/*
 * Picks tab — the glove touch.
 *
 * The most recognisable image in the sport before a fight starts, and the
 * moment a pick refers to: two gloves meeting, and then it's decided.
 *
 * Drawn as chunky forms rather than accurate ones. A real glove has a thumb
 * and a lace panel, and both disappear at 22px — so each side is a rounded
 * mass with a single cuff line, which is enough to read as a glove and
 * survives the size.
 */
export default function PicksGloveTouch({
  size = 22,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* left glove */}
      <Rect
        x={2}
        y={6.5}
        width={9}
        height={11}
        rx={4}
        stroke={color}
        strokeWidth={2}
      />
      <Path d="M5.2 8v8" stroke={color} strokeWidth={2} strokeLinecap="round" />

      {/* right glove, meeting it */}
      <Rect
        x={13}
        y={6.5}
        width={9}
        height={11}
        rx={4}
        stroke={color}
        strokeWidth={2}
      />
      <Path d="M18.8 8v8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
