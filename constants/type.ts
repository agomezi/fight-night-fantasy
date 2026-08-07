import { TextStyle } from "react-native";

/*
 * Two faces, each doing a job the other can't.
 *
 * Display — Unbounded. Every app in this category reaches for a condensed face
 * (Bebas, Oswald, Anton), which is exactly why they all look alike. Unbounded
 * is wide and geometric: still reads as sport at heavy weights, but is
 * immediately distinguishable from the category default. Its softer terminals
 * also sit better with rounded corners than a hard grotesque would.
 *   Swap: replace FONTS.display with "Archivo" (900) for a conservative
 *   neutral-grotesque alternative — that is the only line that changes.
 *
 * Data — IBM Plex Sans. Chosen for figure disambiguation, not flavour. This app
 * is decided by numbers: 41.5 vs 47.5 settles a head-to-head, so a misread
 * digit is a real failure. Plex draws an unambiguous 1, a flat-topped 7 and an
 * open 4, and stays legible at 10px — the size the stat labels need for the
 * density we want.
 */

export const FONTS = {
  display: "Unbounded",
  displayBold: "UnboundedBlack",
  sans: "PlexSans",
  sansMed: "PlexSansMed",
  sansBold: "PlexSansBold",
} as const;

/** Headlines, fighter names, scores. Nothing under 20px. */
export const display = (size: number): TextStyle => ({
  fontFamily: FONTS.display,
  fontSize: size,
  letterSpacing: -size * 0.015,
});

/** Any figure the user compares or reads precisely. */
export const numeric = (size: number, bold = true): TextStyle => ({
  fontFamily: bold ? FONTS.sansBold : FONTS.sansMed,
  fontSize: size,
  fontVariant: ["tabular-nums"],
});

/** Small uppercase metadata. */
export const label: TextStyle = {
  fontFamily: FONTS.sansBold,
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

/**
 * Corner radii. The old direction went to 4px and read as hard; this softens
 * without going to the pill-shaped look the references avoid.
 */
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;
