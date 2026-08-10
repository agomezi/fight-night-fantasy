import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/** The cage outline. Also the home tab icon, so both stay the same shape. */
export const OCTAGON_OUTER =
  "M67.7 51.5 51.5 67.7H28.5L12.3 51.5V28.5L28.5 12.3h23L67.7 28.5z";
export const OCTAGON_INNER =
  "M57.6 47.3 47.3 57.6H32.7L22.4 47.3V32.7L32.7 22.4h14.6l10.3 10.3z";

export default function Octagon({
  size = 74,
  color,
  strokeWidth = 3.5,
  /** The canvas edge inside the fence. */
  inner = true,
}: MarkProps & { inner?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Path
        d={OCTAGON_OUTER}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {inner && (
        <Path
          d={OCTAGON_INNER}
          stroke={color}
          strokeWidth={strokeWidth * 0.72}
          strokeLinejoin="round"
          opacity={0.6}
        />
      )}
    </Svg>
  );
}
