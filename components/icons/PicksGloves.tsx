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
 *
 * Mitt radius is 4 on a 24 grid with the cuffs at 4.8 and 15.8, which leaves
 * a 3-unit gap between them. At 4.6 they overlapped by 2 and merged into one
 * mass — with a large-arc flag the mitt spans well past its cuff, so the
 * spacing has to be worked out from the arc, not the cuff.
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
        d="M11.2 3.9 6.9 7.4M12.8 3.9l4.3 3.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />

      {/* left glove — cuff, then the mitt swelling below it */}
      <Path
        d="M4.8 7.6h3.4v3.4a4 4 0 1 1-3.4 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* right glove */}
      <Path
        d="M15.8 7.6h3.4v3.4a4 4 0 1 1-3.4 0z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
