/**
 * Championship gold. Shared by the trophy and the belt so the two marks are
 * literally the same colour rather than two hexes that drift apart.
 */
export const GOLD = "#E5B23C";

/**
 * Every mark is a standalone SVG component drawn on the same 80×80 grid, so
 * they share proportion and stroke weight and can be swapped for each other
 * anywhere without adjusting anything around them.
 *
 * They render their own <Svg>, which means a mark works equally as a large
 * faint graphic behind a card (see CardMark) or as a small solid icon in the
 * nav — only size and strokeWidth change.
 */
export type MarkProps = {
  size?: number;
  color: string;
  /** Weight on the 80-unit grid. Raise it when rendering small. */
  strokeWidth?: number;
};
