import { StyleSheet } from "react-native";
import { Palette } from "../constants/palette";

// Anton's metrics, as fractions of the font size: the cap height, the gap
// between the top of the line box and the top of the capitals, and the side
// bearing before the first letter. Used to set "FIGHT NIGHT" edge to edge.
const CAP = 1760 / 2048;
const CAP_TOP = (2409 - 1760) / 2048;
const LEFT_BEARING = 78 / 2048;
// Ink width of "NIGHT", the wider word, as a fraction of the font size.
const NIGHT_WIDTH = 4211 / 2048;

export const GUTTER = 24;

/** The title font size that makes "NIGHT" exactly fill the given width. */
export const titleSize = (width: number) => width / NIGHT_WIDTH;

export const makeLoginStyles = (c: Palette) => {
  // The palette has no mode flag; a light status bar means a dark theme.
  const dark = c.statusBar === "light";
  const ink = dark ? "#F4EFE6" : "#111111";
  const muted = dark ? "#9A968F" : "#5E5B55";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: dark ? "#0E0E0E" : "#F6F4EF",
      paddingHorizontal: GUTTER,
    },
    eyebrow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 },
    eyebrowMark: { width: 14, height: 14, backgroundColor: c.red },
    eyebrowText: { color: ink, fontSize: 13, fontWeight: "600", letterSpacing: 5 },
    titleBlock: { marginTop: 14 },
    tagline: {
      color: ink,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 6,
      marginTop: 18,
    },
    heading: {
      color: ink,
      fontSize: 38,
      fontWeight: "800",
      letterSpacing: -1.5,
    },
    subheading: { color: ink, fontSize: 19, marginTop: 4, opacity: 0.85 },
    buttons: { gap: 12, marginTop: 24 },
    // Apple's guidelines allow a custom button in black or white with the
    // Apple logo and an approved title, so it flips with the theme.
    appleButton: { backgroundColor: dark ? "#FFFFFF" : "#000000" },
    appleText: { color: dark ? "#000000" : "#FFFFFF" },
    googleButton: { backgroundColor: dark ? "#232323" : "#DAD7D1" },
    googleText: { color: ink },
    button: {
      height: 56,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDimmed: { opacity: 0.5 },
    buttonRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    buttonText: { fontSize: 18, fontWeight: "600" },
    footnote: { color: muted, fontSize: 14, textAlign: "center", marginTop: 20 },
    legal: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      marginTop: 24,
      marginBottom: 8,
    },
    legalText: { color: muted, fontSize: 13 },
  });
};

/**
 * Per-line layout for the title at a given font size. Each line's box is
 * exactly the capitals' height, so the two words stack tight like a poster.
 */
export const titleLine = (size: number) =>
  StyleSheet.create({
    line: { height: size * CAP, overflow: "visible" },
    text: {
      fontFamily: "Anton",
      fontSize: size,
      marginTop: -size * CAP_TOP,
      marginLeft: -size * LEFT_BEARING,
    },
    gap: { height: size * 0.06 },
    // The red band sits behind the lower part of "NIGHT" and runs just past
    // the baseline, as in the brand mark.
    band: {
      position: "absolute",
      left: 0,
      width: size * NIGHT_WIDTH,
      top: size * CAP * 0.7,
      height: size * CAP * 0.39,
    },
  });
