import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { CARD_ART } from "../constants/cardArt";
import { useTheme } from "../context/ThemeContext";

/*
 * Art that fills a whole card behind its content. It goes in FightCard's
 * `mark` slot, which is already clipped to the card's rounded corners.
 *
 * Four looks:
 * - hero: the cage-grab illustration, anchored right, fading into the card
 *   on the left so the title and countdown sit on plain card colour.
 * - spotlight: a soft pool of light from the top edge.
 * - fence: a chain-link diamond grid in the top-right corner, fading out.
 * - line: a single crimson diagonal across the top-right corner.
 *
 * The three drawn ones are SVG, so they stay crisp at any card size and
 * follow the theme. The hero is a painting, so it has a version per theme.
 * Each family is switched in constants/cardArt.ts.
 */
export type BackdropVariant = "hero" | "spotlight" | "fence" | "line";

// The light version is the same painting with its greys inverted onto a
// white ground and the crimson band left alone.
const CAGE_GRAB = {
  dark: require("../assets/images/card-art/cage-grab.jpg"),
  light: require("../assets/images/card-art/cage-grab-light.jpg"),
};

export default function CardBackdrop({ variant }: { variant: BackdropVariant }) {
  const { c, mode } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  if (variant === "hero" ? !CARD_ART.heroImage : !CARD_ART.backdrops) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {variant === "hero" && (
        <Image
          source={CAGE_GRAB[mode]}
          contentFit="cover"
          contentPosition="right center"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
      {size && (
        <Svg width={size.w} height={size.h}>
          {variant === "hero" && <HeroFade w={size.w} h={size.h} card={c.card} />}
          {variant === "spotlight" && <Spotlight w={size.w} h={size.h} tone={c.text} />}
          {variant === "fence" && <Fence w={size.w} h={size.h} tone={c.text} />}
          {variant === "line" && <CrimsonLine w={size.w} h={size.h} red={c.red} />}
        </Svg>
      )}
    </View>
  );
}

type Box = { w: number; h: number };

/** Card colour over the left of the painting, so text sits on a flat field. */
function HeroFade({ w, h, card }: Box & { card: string }) {
  return (
    <>
      <Defs>
        <LinearGradient id="heroFade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={card} stopOpacity={1} />
          <Stop offset="0.3" stopColor={card} stopOpacity={0.85} />
          <Stop offset="0.6" stopColor={card} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#heroFade)" />
    </>
  );
}

function Spotlight({ w, h, tone }: Box & { tone: string }) {
  return (
    <>
      <Defs>
        <RadialGradient
          id="spot"
          cx={w / 2}
          cy={0}
          rx={w * 0.75}
          ry={h * 0.9}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={tone} stopOpacity={0.09} />
          <Stop offset="1" stopColor={tone} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#spot)" />
    </>
  );
}

/** Diagonal grid strongest in the top-right corner, gone by the middle. */
function Fence({ w, h, tone }: Box & { tone: string }) {
  const STEP = 22;
  const lines = [];
  for (let b = -h; b <= w + h; b += STEP) {
    lines.push(<Line key={`a${b}`} x1={b} y1={0} x2={b - h} y2={h} />);
    lines.push(<Line key={`b${b}`} x1={b} y1={0} x2={b + h} y2={h} />);
  }
  return (
    <>
      <Defs>
        <LinearGradient
          id="fenceFade"
          x1={w}
          y1={0}
          x2={w * 0.4}
          y2={h * 0.75}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={tone} stopOpacity={0.14} />
          <Stop offset="1" stopColor={tone} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* Line ignores fill, so the strokes carry the gradient. */}
      <G stroke="url(#fenceFade)" strokeWidth={1.2}>{lines}</G>
    </>
  );
}

function CrimsonLine({ w, red }: Box & { red: string }) {
  return (
    <Line
      x1={w * 0.68}
      y1={0}
      x2={w}
      y2={w * 0.32}
      stroke={red}
      strokeWidth={2}
      strokeOpacity={0.9}
    />
  );
}
