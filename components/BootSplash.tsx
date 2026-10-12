import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { nextGuard, STILL_MS } from "./bootCombo";

/** The art's own background, so the edges of the GIF disappear into it. */
const BACKGROUND = "#0A0A0A";
/** The fighter in his guard: the combo's first frame, held still. */
const STILL = require("../assets/images/boot-guard.png");
const COMBO = require("../assets/images/boot-combo.gif");
const ART_WIDTH = 344;
const ART_HEIGHT = 384;

/** If the art never shows, the native splash goes anyway after this long. */
const FALLBACK_MS = 500;

/**
 * What a cold start shows while the session and profile are read: the
 * fighter standing in his guard by the bag. If that takes longer than
 * STILL_MS he starts working it, and once ready finishes the strike in
 * progress first (see bootCombo). It takes over from the native splash once
 * the art is up and fades out over the app, which mounts underneath.
 */
export default function BootSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const artWidth = Math.min(ART_WIDTH, width * 0.8);
  const artStyle = { width: artWidth, height: (artWidth * ART_HEIGHT) / ART_WIDTH };
  // When the still went up, and when the combo's first frame did.
  const [stillAt, setStillAt] = useState<number | null>(null);
  const [comboAt, setComboAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);

  const showStill = useCallback(() => {
    setStillAt((t) => t ?? Date.now());
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const showCombo = useCallback(() => setComboAt((t) => t ?? Date.now()), []);

  useEffect(() => {
    const t = setTimeout(showStill, FALLBACK_MS);
    return () => clearTimeout(t);
  }, [showStill]);

  useEffect(() => {
    if (ready || stillAt == null) return;
    const t = setTimeout(() => setSlow(true), STILL_MS);
    return () => clearTimeout(t);
  }, [ready, stillAt]);

  useEffect(() => {
    if (!ready || stillAt == null) return;
    // Still in his guard: go now.
    if (comboAt == null) return onDone();
    const elapsed = Date.now() - comboAt;
    const t = setTimeout(onDone, nextGuard(elapsed) - elapsed);
    return () => clearTimeout(t);
  }, [ready, stillAt, comboAt, onDone]);

  return (
    <Animated.View
      exiting={FadeOut.duration(180)}
      style={[StyleSheet.absoluteFill, { backgroundColor: BACKGROUND, alignItems: "center", justifyContent: "center" }]}
      accessible
      accessibilityLabel="Loading"
    >
      <View style={artStyle}>
        <Image source={STILL} style={StyleSheet.absoluteFill} contentFit="contain" onDisplay={showStill} onError={showStill} />
        {/* Starts on the same frame as the still, laid over it, so the switch
            doesn't show. */}
        {slow && <Image source={COMBO} style={StyleSheet.absoluteFill} contentFit="contain" onDisplay={showCombo} />}
      </View>
      <StatusBar style="light" />
    </Animated.View>
  );
}
