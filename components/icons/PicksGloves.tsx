import { Circle, Path, Svg } from "react-native-svg";

/*
 * Picks tab — a hanging pair.
 *
 * The recognisable thing about gloves isn't a single glove, it's the pair
 * slung by their laces. That silhouette — two round masses with cords
 * converging to a point above — survives being shrunk in a way an accurate
 * single glove does not, which is what sank the last two attempts.
 *
 * Each glove is a narrow cuff opening into a round mitt below. The laces do
 * most of the identifying work, so they stay thin and the mitts stay heavy.
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
      <Circle cx={12} cy={2.6} r={1.4} stroke={color} strokeWidth={1.6} />

      {/* laces */}
      <Path
        d="M11.3 3.8 8.6 7.6M12.7 3.8l2.7 3.8"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />

      {/* left glove — cuff, then the mitt swelling below it */}
      <Path
        d="M6.4 7.6h4.2v3.6a4.6 4.6 0 1 1-4.2 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* right glove */}
      <Path
        d="M13.4 7.6h4.2v3.6a4.6 4.6 0 1 1-4.2 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
