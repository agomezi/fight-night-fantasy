import { Image, ImageSourcePropType, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

/*
 * The slot fighter art drops into — and the fallback when a fighter has no
 * headshot.
 *
 * Kept deliberately: this is the answer to "what shows when we have no image
 * for someone". Initials over a corner-tinted well, with a skewed inner edge
 * so a facing pair reads as a matchup. Pass `source` and the same frame holds
 * a PNG instead; the tint, the lean, the plinth rule and the sizing all belong
 * to the frame, so real art inherits the treatment.
 *
 * The tint is the fighter's corner, so it carries who is red and who is blue
 * before a word is read.
 *
 * Currently used on: the home NEXT EVENT card, where the main-event fighters
 * will get real headshots. Not used on leagues or picks — undecided.
 */
export default function FighterFace({
  initials,
  corner,
  source,
  height = 96,
  /** Angles the inner edge so the two faces lean into each other. */
  lean = "none",
}: {
  initials: string;
  corner: "red" | "blue";
  source?: ImageSourcePropType;
  height?: number;
  lean?: "left" | "right" | "none";
}) {
  const { c } = useTheme();
  const accent = corner === "red" ? c.red : c.blue;

  return (
    <View
      style={{
        flex: 1,
        height,
        backgroundColor: c.inset,
        borderRadius: 8,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {/* corner wash, heaviest at the outer edge */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: accent,
          opacity: 0.13,
        }}
      />

      {/* the lean: a skewed band along the inner edge, so the pair reads as a
          matchup rather than two unrelated tiles */}
      {lean !== "none" && (
        <View
          style={{
            position: "absolute",
            top: -height * 0.4,
            bottom: -height * 0.4,
            [lean === "left" ? "left" : "right"]: -height * 0.28,
            width: height * 0.5,
            backgroundColor: accent,
            opacity: 0.16,
            transform: [{ rotate: lean === "left" ? "16deg" : "-16deg" }],
          }}
        />
      )}

      {source ? (
        <Image
          source={source}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Text
          style={{
            fontFamily: "BebasNeue",
            fontSize: height * 0.42,
            lineHeight: height * 0.46,
            letterSpacing: 1,
            color: accent,
            opacity: 0.85,
            marginBottom: height * 0.14,
          }}
        >
          {initials}
        </Text>
      )}

      {/* base rule in the corner colour — reads as a plinth under the figure */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          backgroundColor: accent,
        }}
      />
    </View>
  );
}
