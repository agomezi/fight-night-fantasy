import { Image } from "expo-image";
import { useState } from "react";
import { Text, type TextStyle } from "react-native";

/**
 * A fighter's headshot, filling its parent, or their initials when there is no
 * photo or it fails to load. The parent keeps its own border and badges.
 */
export default function FighterPhoto({
  uri,
  initials,
  radius,
  textStyle,
}: {
  uri?: string | null;
  initials: string;
  /** Match the parent's corner radius; the image sits inside its border. */
  radius: number;
  textStyle: TextStyle;
}) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <Text style={textStyle}>{initials}</Text>;
  return (
    <Image
      source={{ uri }}
      // Headshots are framed from the top; keep faces in view when cropped.
      contentFit="cover"
      contentPosition="top"
      transition={150}
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius }}
    />
  );
}
