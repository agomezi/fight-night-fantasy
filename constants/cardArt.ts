/*
 * Switches for the card-art pass, all in one place so any piece can be
 * turned off without touching the screens that use it.
 *
 * Off puts back exactly what was there before: no hero image, no
 * backdrops, and the original line-art glove.
 */
export const CARD_ART = {
  /** Cage-grab illustration behind the NEXT EVENT card. Dark theme only. */
  heroImage: true,
  /** Spotlight / fence / crimson-line backdrops on the other carousel cards. */
  backdrops: true,
  /** Faceted glove mark instead of the line-art one. */
  flatGlove: true,
} as const;
