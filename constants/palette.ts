export type ThemeMode = "dark" | "light";

/*
 * Colour roles named for the venue, not for a token generator.
 *
 * The core idea: red and blue are *assignments*, not styling. Every bout puts
 * one fighter in the red corner and one in the blue — it's on the scorecards
 * and the cage. A card is red because that fighter is in the red corner, never
 * because red looked good there. That gives the palette a job a single accent
 * on charcoal can never have.
 *
 * Rule: a loss is never red. Red already means red corner; making it also mean
 * "wrong" breaks the system. Losses drop to textFaint and reduced opacity.
 *
 * The legacy keys (bg, card, red, …) are kept so existing screens keep
 * compiling. `red` now holds cornerRed.
 */

export type Palette = {
  // --- grounds ---------------------------------------------------------
  /** Vinyl-coated cage mesh. Matte, cool, never pure black. */
  bg: string;
  navBar: string;
  loginBg: string;
  /** The padded apron around the canvas — one step up from the ground. */
  card: string;
  inset: string;
  surface2: string;
  heroTint: string;
  redTint: string;
  input: string;
  /** Taped seams between cage panels. Every hairline. */
  border: string;
  borderStrong: string;
  loginBorder: string;

  // --- ink -------------------------------------------------------------
  /** Octagon canvas — warm, scuffed off-white. Never #FFFFFF. */
  text: string;
  text2: string;
  textMuted: string;
  textFaint: string;

  // --- corners ---------------------------------------------------------
  /** Red corner pad. Assigned to a fighter; your side in head-to-head. */
  cornerRed: string;
  /** Blue corner pad. The other fighter; your opponent. */
  cornerBlue: string;
  /** Alias of cornerRed — the primary accent for legacy call sites. */
  red: string;
  /** Ink that stays legible on a corner fill. */
  onAccent: string;
  /** Championship plate — brass, not yellow gold. Titles, wins, settled results. */
  belt: string;

  green: string;
  blue: string;
  logoText: string;
  overlay: string;
  statusBar: "light" | "dark";
};

export const darkPalette: Palette = {
  bg: "#0B0C0F",
  navBar: "#101216",
  loginBg: "#101216",
  card: "#15171C",
  inset: "#111318",
  surface2: "#1A1D23",
  heroTint: "#17141A",
  redTint: "rgba(222,32,51,0.10)",
  input: "#181B21",
  border: "#22252C",
  borderStrong: "#31353E",
  loginBorder: "#3A2A2E",

  text: "#E9E4D9",
  text2: "#BEB9AE",
  textMuted: "#9A968C",
  textFaint: "#63615B",

  cornerRed: "#DE2033",
  cornerBlue: "#2A6BD4",
  red: "#DE2033",
  onAccent: "#FFF6F2",
  belt: "#C4A252",

  green: "#3FA96B",
  blue: "#2A6BD4",
  logoText: "#E9E4D9",
  overlay: "rgba(6,7,9,0.92)",
  statusBar: "light",
};

export const lightPalette: Palette = {
  // Light mode inverts the ground relationship, not the hues: canvas becomes
  // the ground and fence becomes the ink.
  bg: "#E9E4D9",
  navBar: "#F2EEE5",
  loginBg: "#F2EEE5",
  card: "#F4F0E7",
  inset: "#E2DCD0",
  surface2: "#DDD6C8",
  heroTint: "#F1E6E2",
  redTint: "rgba(196,27,44,0.10)",
  input: "#E5DFD3",
  border: "#D2CBBC",
  borderStrong: "#B6AE9D",
  loginBorder: "#D8BDB8",

  text: "#14150F",
  text2: "#3B3C33",
  textMuted: "#68675C",
  textFaint: "#918F82",

  // Corners darken to hold contrast on a warm light ground.
  cornerRed: "#C41B2C",
  cornerBlue: "#1F55AC",
  red: "#C41B2C",
  onAccent: "#FFF8F4",
  belt: "#8A6F2E",

  green: "#2A7A4B",
  blue: "#1F55AC",
  logoText: "#14150F",
  overlay: "rgba(20,21,15,0.45)",
  statusBar: "dark",
};

export const palettes: Record<ThemeMode, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};
