import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { nextGuard } from "./bootCombo";

/** The art's own background, so the edges of the GIF disappear into it. */
const BACKGROUND = "#0A0A0A";
const ART = require("../assets/images/boot-combo.gif");
const ART_WIDTH = 344;
const ART_HEIGHT = 384;

/** If the art never shows, the native splash goes anyway after this long. */
const FALLBACK_MS = 500;

/**
 * What a cold start shows while the session and profile are read: the
 * fighter working the bag. It takes over from the native splash once its
 * first frame is up, and calls `onDone` at the first guard after `ready`
 * (see bootCombo), so a quick start is just the jab and a slow one keeps
 * going. Fades out over the app, which has been mounting underneath.
 */
export default function BootSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const artWidth = Math.min(ART_WIDTH, width * 0.8);
  // When the first frame went up.
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const start = useCallback(() => {
    setStartedAt((t) => t ?? Date.now());
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(start, FALLBACK_MS);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => {
    if (!ready || startedAt == null) return;
    const elapsed = Date.now() - startedAt;
    const t = setTimeout(onDone, nextGuard(elapsed) - elapsed);
    return () => clearTimeout(t);
  }, [ready, startedAt, onDone]);

  return (
    <Animated.View
      exiting={FadeOut.duration(180)}
      style={[StyleSheet.absoluteFill, { backgroundColor: BACKGROUND, alignItems: "center", justifyContent: "center" }]}
      accessible
      accessibilityLabel="Loading"
    >
      <Image
        source={ART}
        style={{ width: artWidth, height: (artWidth * ART_HEIGHT) / ART_WIDTH }}
        contentFit="contain"
        onDisplay={start}
        onError={start}
      />
      <StatusBar style="light" />
    </Animated.View>
  );
}
