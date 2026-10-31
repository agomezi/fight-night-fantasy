import Svg, { G, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";

/*
 * What sits beside a place in a league table: the title belt for 1st (a gold
 * medal while a Champion holds the belt above the table), silver and bronze
 * medals for 2nd and 3rd, and from 4th down an arrow for which way
 * the last card moved you (a dash when it didn't). The home league card holds
 * up the league trophy from 4th down instead of an arrow.
 *
 * Drawn in the flat cage-grab style: two or three flat tones a shape, lit from
 * the upper left. Colours are fixed rather than themed, as metals read the
 * same on light and dark cards.
 */

/** A regular octagon's points, flat on every side. */
function octagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

const METALS = {
  gold: { base: "#FFCA3A", dark: "#C8901A", ink: "#5A3A05" },
  silver: { base: "#C9CED6", dark: "#868C96", ink: "#33373E" },
  bronze: { base: "#D2894B", dark: "#8E5226", ink: "#3F220C" },
};

/** About twice as wide as tall: the belt is cropped to itself. */
const BELT_ASPECT = 68 / 31;

export function TitleBelt({ height = 20 }: { height?: number }) {
  return (
    <Svg width={height * BELT_ASPECT} height={height} viewBox="6 26 68 31" fill="none">
      <G transform="translate(40 41) scale(0.95 0.94) translate(-40 -41)">
        <Path
          fill="#1D1D1F"
          d="M6 35.5 Q6 34.5 7 34.5 C10 34.5 12.5 33.9 15.5 33.9 C19 34 22 34.25 25 34.5 H55 C58 34.25 61 34 64.5 33.9 C67.5 33.9 70 34.5 73 34.5 Q74 34.5 74 35.5 V46.5 Q74 47.5 73 47.5 C70 47.5 67.5 48.5 64.5 48.9 C61 49 58 49.25 55 49.5 H25 C22 49.25 19 49 15.5 48.9 C12.5 48.5 10 47.5 7 47.5 Q6 47.5 6 46.5z"
        />
        <Path
          fill="#353538"
          d="M6 35.5 Q6 34.5 7 34.5 C10 34.5 12.5 33.9 15.5 33.9 C19 34 22 34.25 25 34.5 H55 C58 34.25 61 34 64.5 33.9 C67.5 33.9 70 34.5 73 34.5 Q74 34.5 74 35.5 V39.8 C70 39.8 67.5 39.6 64.5 39.7 C61 40 58 40.25 55 40.5 H25 C22 40.25 19 40 15.5 39.7 C12.5 39.6 10 39.8 6 39.8z"
        />
      </G>
      <G transform="translate(19 41) scale(0.85) translate(-19 -41)">
        <Path fill="#C8901A" d="M13 41 16 34h6l3 7-3 7h-6z" />
        <Path fill="#FFCA3A" d="M14.8 41 17.2 35.8h3.6l2.4 5.2-2.4 5.2h-3.6z" />
        <Path fill="#FFE38F" d="M13 41 16 34h6l-1.2 1.8h-3.6L14.8 41z" />
      </G>
      <G transform="translate(61 41) scale(0.85) translate(-61 -41)">
        <Path fill="#C8901A" d="M55 41 58 34h6l3 7-3 7h-6z" />
        <Path fill="#FFCA3A" d="M56.8 41 59.2 35.8h3.6l2.4 5.2-2.4 5.2h-3.6z" />
        <Path fill="#FFE38F" d="M55 41 58 34h6l-1.2 1.8h-3.6L56.8 41z" />
      </G>
      <Path
        fill="#C8901A"
        d="M25 35 C29 34 29 32 32 31.5 C35 31 35 28 38 28 Q40 28.3 42 28 C45 28 45 31 48 31.5 C51 32 51 34 55 35 L55.5 38 53.5 40 V44 L55.5 46.5 55 49 C51 50 50 50 48.5 52 Q40 55.5 31.5 52 C30 50 29 50 25 49 L24.5 46.5 26.5 44 V40 L24.5 38z"
      />
      <Path
        fill="#FFE38F"
        d="M25 35 C29 34 29 32 32 31.5 C35 31 35 28 38 28 Q40 28.3 42 28 L42 29.2 H38 C35.8 29.2 35.7 32 32.5 32.8 C29.8 33.4 29.5 35 26.3 36.1z"
      />
      <Path
        fill="#FFCA3A"
        transform="translate(40 41) scale(.88) translate(-40 -41)"
        d="M25 35 C29 34 29 32 32 31.5 C35 31 35 28 38 28 Q40 28.3 42 28 C45 28 45 31 48 31.5 C51 32 51 34 55 35 L55.5 38 53.5 40 V44 L55.5 46.5 55 49 C51 50 50 50 48.5 52 Q40 55.5 31.5 52 C30 50 29 50 25 49 L24.5 46.5 26.5 44 V40 L24.5 38z"
      />
      <Path fill="#C8901A" d="M33 35.5 35 33.5h10l2 2z M34 46.5h12l-2 2h-8z" />
      <Path fill="#C8901A" d="M30 43h20v1.5H30z" />
      <Path fill="#FFCA3A" d="M30 37h20v6H30z" />
      <Path fill="#FFE38F" d="M30 37h20v.7H30z" />
    </Svg>
  );
}

/** The league trophy, in the belt's flat gold: what the home card holds up
 * from 4th down. */
export function LeagueTrophy({ height = 60 }: { height?: number }) {
  return (
    <Svg width={(height * 60) / 68} height={height} viewBox="10 6 60 68" fill="none">
      <Path d="M25 18 H18.5 Q16.5 18 16.8 20.5 C17.6 26.5 20.5 30.5 26 32.5" stroke="#C8901A" strokeWidth={4} strokeLinecap="round" />
      <Path d="M55 18 H61.5 Q63.5 18 63.2 20.5 C62.4 26.5 59.5 30.5 54 32.5" stroke="#C8901A" strokeWidth={4} strokeLinecap="round" />
      <Path fill="#C8901A" d="M24 14 H56 V29 C56 39.5 49 47 40 47 C31 47 24 39.5 24 29 Z" />
      <Path
        fill="#FFE38F"
        d="M24 14 H56 L54.2 16.2 H27.5 C26.8 16.2 26.2 16.8 26.2 17.5 V29 C26.2 34 27.6 38.2 30.2 41.2 L28.8 42.8 C25.7 39.4 24 34.6 24 29 Z"
      />
      <Path
        fill="#FFCA3A"
        transform="translate(40 30) scale(.86) translate(-40 -30)"
        d="M24 14 H56 V29 C56 39.5 49 47 40 47 C31 47 24 39.5 24 29 Z"
      />
      <Rect x={22} y={11} width={36} height={4.5} rx={1.2} fill="#C8901A" />
      <Rect x={22} y={11} width={36} height={1.6} rx={0.8} fill="#FFE38F" />
      <Path fill="#C8901A" d="M36.5 46.5h7l2 9h-11z" />
      <Path fill="#FFE38F" d="M36.5 46.5h2.2l-1.2 9h-3z" />
      <Rect x={29} y={55} width={22} height={5} rx={1} fill="#FFCA3A" />
      <Rect x={29} y={55} width={22} height={1.4} rx={0.7} fill="#FFE38F" />
      <Rect x={25} y={60} width={30} height={7} rx={1.4} fill="#C8901A" />
      <Rect x={25} y={60} width={30} height={2} rx={1} fill="#FFCA3A" />
    </Svg>
  );
}

/** An octagon medal on the red stripe folded into a ribbon. */
export function Medal({ place, size = 20 }: { place: 1 | 2 | 3; size?: number }) {
  const m = place === 1 ? METALS.gold : place === 2 ? METALS.silver : METALS.bronze;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Polygon points="14,2 27,2 37,27 24,27" fill="#9E0029" />
      <Polygon points="37,2 50,2 40,27 27,27" fill="#E8003D" />
      <Polygon points={octagon(32, 41, 20)} fill={m.dark} />
      <Polygon points={octagon(32, 41, 15)} fill={m.base} />
      <SvgText x={32} y={49.5} textAnchor="middle" fontFamily="Anton" fontSize={20} fill={m.ink}>
        {place}
      </SvgText>
    </Svg>
  );
}

/** Up, down, or level since before the last card. */
export function MoveArrow({ move, size = 20 }: { move: number | undefined; size?: number }) {
  const dir = !move ? "flat" : move > 0 ? "up" : "down";
  const color = dir === "up" ? "#2ecc71" : dir === "down" ? "#E8003D" : "#888888";
  const tint = dir === "up" ? "rgba(46,204,113,0.14)" : dir === "down" ? "rgba(232,0,61,0.14)" : "rgba(136,136,136,0.12)";
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={6} y={6} width={52} height={52} rx={14} fill={tint} />
      {dir === "flat" ? (
        <Path d="M22 32h20" stroke={color} strokeWidth={6} strokeLinecap="round" />
      ) : (
        <Path
          d={dir === "up" ? "M19 38l13-13 13 13" : "M19 26l13 13 13-13"}
          stroke={color}
          strokeWidth={6.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

/** The mark for a place: belt, medal, or movement arrow. Nothing unranked.
 * `crowned`: a Champion holds the belt, so 1st takes a gold medal. */
export default function RankMark({
  rank,
  move,
  size = 20,
  crowned,
}: {
  rank: number | null;
  move?: number;
  size?: number;
  crowned?: boolean;
}) {
  if (rank == null) return null;
  if (rank === 1) return crowned ? <Medal place={1} size={size} /> : <TitleBelt height={size * 0.8} />;
  if (rank === 2 || rank === 3) return <Medal place={rank} size={size} />;
  return <MoveArrow move={move} size={size} />;
}
