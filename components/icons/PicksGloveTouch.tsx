import { Path, Svg } from "react-native-svg";

/*
 * Picks tab — the glove touch.
 *
 * The last version was two rounded rectangles and read as such. What makes a
 * glove legible is the thumb: a smaller lobe jutting off the back of the
 * mitt, below the knuckle line. Without it you have a pill.
 *
 * So each side is one continuous outline — domed striking face, flat back,
 * and the thumb bulging out beneath — rather than shapes stacked together.
 * A single path means no seams where outlines would cross, which is what
 * muddies line art at this size.
 *
 * The two meet at centre, which is the moment a pick refers to.
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
      {/* left glove, facing right */}
      <Path
        d="M3 6.5h2.5a5.5 5.5 0 0 1 0 11H5a2.5 2.5 0 0 1 0-5h.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 6.5v11" stroke={color} strokeWidth={2} strokeLinecap="round" />

      {/* right glove, facing left */}
      <Path
        d="M21 6.5h-2.5a5.5 5.5 0 0 0 0 11h.5a2.5 2.5 0 0 0 0-5h-.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M21 6.5v11" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
