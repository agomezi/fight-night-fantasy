import { Circle, G, Path, Svg } from "react-native-svg";

/*
 * Picks tab — a hanging pair.
 *
 * Redrawn against a reference of real hanging gloves. Two things there that
 * my upright version was missing, and both are why it read as luggage:
 *
 * 1. They dangle at an angle. Gloves on a lace tilt away from each other,
 *    they don't hang plumb. Each side gets 13 degrees of lean, which is what
 *    turns two bags into a hanging pair. The lean swings the bodies toward
 *    each other, so they sit a unit further apart than upright to keep a
 *    3-unit gap — at a 2-wide stroke anything less and the edges touch.
 *
 * 2. The thumb. It's a lobe on the outer edge, low, and without it the body
 *    is just a rounded bag — that's the whole difference between a glove and
 *    a pouch. It's cut into the outline rather than stacked on top, so no
 *    two strokes cross.
 *
 * Body stays one width top to bottom with a flat top edge, which is what
 * stopped an earlier version reading as handcuffs.
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
      <Circle cx={12} cy={2.2} r={1.2} stroke={color} strokeWidth={1.4} />

      {/* laces, out to each cuff */}
      <Path
        d="M11.3 3.2 5.9 6.3M12.7 3.2l5.4 3.1"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* left glove, leaning out */}
      <G transform="rotate(-13 6.6 12)">
        <Path
          d="M5.2 6.6H8a1.4 1.4 0 0 1 1.4 1.4v6.4a2.8 2.8 0 0 1-2.8 2.8 2.8 2.8 0 0 1-2.7-2.1 2.2 2.2 0 0 1-1.9-2.2 2.2 2.2 0 0 1 1.8-2V8a1.4 1.4 0 0 1 1.4-1.4z"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </G>

      {/* right glove, mirrored and leaning the other way */}
      <G transform="rotate(13 17.4 12)">
        <Path
          d="M18.8 6.6H16a1.4 1.4 0 0 0-1.4 1.4v6.4a2.8 2.8 0 0 0 2.8 2.8 2.8 2.8 0 0 0 2.7-2.1 2.2 2.2 0 0 0 1.9-2.2 2.2 2.2 0 0 0-1.8-2V8a1.4 1.4 0 0 0-1.4-1.4z"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
