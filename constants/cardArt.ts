/*
 * Switches for the card-art pass, all in one place so any piece can be
 * turned off without touching the screens that use it.
 *
 * Off puts back exactly what was there before: no hero image, no
 * backdrops, and the original line-art glove.
 */
export const CARD_ART = {
  /** Cage-grab illustration behind the NEXT EVENT card, a version per theme. */
  heroImage: true,
  /** Spotlight and crimson-line backdrops on the picks and live cards. */
  backdrops: true,
  /** Faceted boxing glove mark instead of the line-art one. */
  flatGlove: true,
} as const;
