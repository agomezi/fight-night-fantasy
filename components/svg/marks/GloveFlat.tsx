import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * MMA glove, front-on, as flat faceted shapes rather than line art.
 *
 * Traced from the card-art exploration: four open finger tips, a tapered
 * palm with a lit facet down each side, the thumb tucked on the right, and
 * a wrist cuff. Everything is one colour at two strengths, so it still
 * follows the theme and still sits quietly behind a card via CardMark.
 *
 * Pieces meet at small gaps instead of touching. In one colour, shapes that
 * touch merge into a blob, and the gaps are what keep the fingers and cuff
 * readable at 74px.
 *
 * Fills only, so strokeWidth is ignored.
 */
const BASE = 0.45;
const LIT = 0.8;

export default function GloveFlat({ size = 74, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      {/* palm, with a lit facet down each side */}
      <Path d="M5 20 70.5 20 66 59.5 12.5 59.5z" fill={color} fillOpacity={BASE} />
      <Path d="M5 20 17 29 21.5 59.5 12.5 59.5z" fill={color} fillOpacity={LIT} />
      <Path d="M70.5 20 58.5 29 52 59.5 66 59.5z" fill={color} fillOpacity={LIT} />

      {/* thumb */}
      <Path
        d="M71.5 25.5 76.5 27.5 78 33.5 73.5 46.5 67.5 52.5 69 36z"
        fill={color}
        fillOpacity={BASE}
      />
      <Path d="M76.5 27.5 78 33.5 73.5 46.5 72.5 34z" fill={color} fillOpacity={LIT} />

      {/* finger tips — the band across each top catches the light */}
      {FINGERS.map(([tip]) => (
        <Path key={tip} d={tip} fill={color} fillOpacity={BASE} />
      ))}
      {FINGERS.map(([, band]) => (
        <Path key={band} d={band} fill={color} fillOpacity={BASE} />
      ))}

      {/* cuff, lit at both ends */}
      <Path
        d="M12 61.5h50.5l1 1v15.5l-1 1h-50.5l-1-1v-15.5z"
        fill={color}
        fillOpacity={BASE}
      />
      <Path d="M12 61.5h6.5l3.5 4.5v8l-3.5 5h-6.5l-1-1v-15.5z" fill={color} fillOpacity={LIT} />
      <Path d="M62.5 61.5h-6.5l-3.5 4.5v8l3.5 5h6.5l1-1v-15.5z" fill={color} fillOpacity={LIT} />
    </Svg>
  );
}

/** [tip, light band] per finger, left to right. */
const FINGERS: [string, string][] = [
  ["M8 1.5h11.5l2 2v12l-3 3h-10l-2.5-3v-12z", "M8 1.5h11.5l2 2v3.5h-15.5v-3.5z"],
  ["M25.5 1.5h9.5l1.5 2v12l-3 3h-7l-2.5-3v-12z", "M25.5 1.5h9.5l1.5 2v3.5h-12.5v-3.5z"],
  ["M41.5 1.5h10l1.5 2v12l-3 3h-7l-2.5-3v-12z", "M41.5 1.5h10l1.5 2v3.5h-12.5v-3.5z"],
  ["M56.5 1.5h12l2 2v12l-3 3h-10l-2.5-3v-12z", "M56.5 1.5h12l2 2v3.5h-16v-3.5z"],
];
