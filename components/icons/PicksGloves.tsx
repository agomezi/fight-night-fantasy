import { Circle, Path, Svg } from "react-native-svg";

/*
 * Picks tab — a hanging pair.
 *
 * The previous version read as handcuffs, and the geometry says why: a
 * narrow cuff feeding a near-perfect circle is a link and a ring. Two of
 * them on cords is a cuff, not a glove.
 *
 * The fix is proportion, not detail. Each glove is now one body 7.2 wide the
 * whole way down — squared shoulders at the top, straight sides, and only
 * the bottom rounded off. Nothing narrows, so there's no link to read, and
 * the flat top edge stops it closing into a ring.
 *
 * A strap line across the wrist does the rest of the work: it's the detail
 * that says glove, and it breaks the silhouette so the shape can't collapse
 * back into a circle at size.
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
      {/* the hook they hang from */}
      <Circle cx={12} cy={2.4} r={1.3} stroke={color} strokeWidth={1.5} />

      {/* laces */}
      <Path
        d="M11.2 3.5 7.6 6.9M12.8 3.5l3.6 3.4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* left glove — square shoulders, round bottom, no waist */}
      <Path
        d="M4.9 7h4.2a1.5 1.5 0 0 1 1.5 1.5v4a3.6 3.6 0 0 1-7.2 0v-4A1.5 1.5 0 0 1 4.9 7z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M3.6 10.3h6.8" stroke={color} strokeWidth={1.5} />

      {/* right glove */}
      <Path
        d="M14.9 7h4.2a1.5 1.5 0 0 1 1.5 1.5v4a3.6 3.6 0 0 1-7.2 0v-4A1.5 1.5 0 0 1 14.9 7z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M13.6 10.3h6.8" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}
