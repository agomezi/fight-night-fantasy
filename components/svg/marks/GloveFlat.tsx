import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/*
 * Boxing glove, front-on, as flat faceted shapes rather than line art.
 *
 * Traced from the card-art exploration: a mitt with its crown catching the
 * light, the thumb tucked on the left, and a wrist cuff. Everything is one
 * colour at two strengths, so it follows the theme in light and dark and
 * still sits quietly behind a card via CardMark.
 *
 * Pieces meet at small gaps instead of touching. In one colour, shapes that
 * touch merge into a blob, and the gaps are what keep the thumb and cuff
 * readable at 74px.
 *
 * It sits in the same box as the line-art glove (x 15–60, y 10–71), so
 * swapping one for the other moves nothing on the card.
 *
 * Fills only, so strokeWidth is ignored.
 */
const BASE = 0.45;
const MID = 0.6;

export default function GloveFlat({ size = 74, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      {/* mitt */}
      <Path
        d="M23.1 16.2 29.3 11.3 34.8 10.1 49.7 11.9 56.2 15.8 59 21.4 60.1 26.9 52.9 52.2 48.7 54.5 33.8 54.5 28.6 52.9 27.6 48 27.3 33 22.2 20z"
        fill={color}
        fillOpacity={BASE}
      />
      {/* crown — laid over the mitt, so the two strengths add up to the lit top */}
      <Path
        d="M23.1 16.2 29.3 11.3 34.8 10.1 49.7 11.9 56.2 15.8 59 21.4 60.1 26.9 54.3 33.5 45.9 34.7 36.4 32.1 31.3 25 28 21.1z"
        fill={color}
        fillOpacity={BASE}
      />
      {/* thumb */}
      <Path
        d="M14.8 31 18.2 24.6 22.6 23.8 25.4 26.8 25.3 34.3 26.3 46.5 25.5 49.5 20.8 45.8 16.4 39z"
        fill={color}
        fillOpacity={MID}
      />
      {/* cuff */}
      <Path
        d="M27.4 56.6 29.3 58.1 34.5 59 48.1 58.7 53 56.6 53.2 69 50.7 71 29 70.4 27.4 68.4z"
        fill={color}
        fillOpacity={MID}
      />
    </Svg>
  );
}
