import { Circle, G, Rect, Svg } from "react-native-svg";

/*
 * Picks tab — one glove.
 *
 * Four attempts drew a hanging pair, and the pair is the problem. Two
 * gloves plus cuffs, thumbs, laces and a hook is six elements inside 22px,
 * which gives each glove about nine pixels. Nothing survives that.
 *
 * So: one glove, filling the frame, and solid rather than outlined. A
 * stroke at this size spends most of its width on the outline itself and
 * leaves almost nothing inside; a filled silhouette keeps its shape all the
 * way down. It carries more weight than the other tabs, which is fine —
 * this is the tab the app is for.
 *
 * Built from three overlapping shapes rather than one traced path. Fills
 * merge into a single silhouette with no seams, so the geometry can't go
 * subtly wrong the way a hand-written outline can. Mitt, thumb below it,
 * and the wrist cuff set back with a gap so the glove reads as a glove
 * rather than one undifferentiated blob.
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
      {/* leaning slightly, the way a glove sits rather than stands */}
      <G transform="rotate(-8 12 12)">
        {/* wrist cuff, held off the mitt so the join reads */}
        <Rect x={2} y={8.4} width={5.4} height={7.6} rx={2} fill={color} />

        {/* mitt */}
        <Circle cx={15} cy={11.2} r={6.6} fill={color} />

        {/* thumb */}
        <Circle cx={11.6} cy={17} r={3.1} fill={color} />
      </G>
    </Svg>
  );
}
