import Svg, { Path } from "react-native-svg";
import { MarkProps } from "./types";

/** League standing. Vertical form, deliberately unlike the belt. */
export default function Trophy({ size = 74, color, strokeWidth = 3 }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* cup */}
      <Path
        d="M24 10h32v20c0 8.8-7.2 16-16 16s-16-7.2-16-16V10z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* handles */}
      <Path
        d="M24 14h-8a8 8 0 0 0 8 8M56 14h8a8 8 0 0 1-8 8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* stem and base */}
      <Path
        d="M40 46v10M28 66h24M32 56h16l4 10H28l4-10z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
