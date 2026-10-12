import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import { BOOT_SEEN_KEY } from "../constants/storage";
import { comboEnd, STILL_MS } from "./bootCombo";

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
 * progress first (see bootCombo). The very first launch on a phone throws
 * the whole combo instead. It takes over from the native splash once the art
 * is up and fades out over the app, which mounts underneath.
 */
export default function BootSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const artWidth = Math.min(ART_WIDTH, width * 0.8);
  const artStyle = { width: artWidth, height: (artWidth * ART_HEIGHT) / ART_WIDTH };
  // When the still went up, and when the combo's first frame did.
  const [stillAt, setStillAt] = useState<number | null>(null);
  const [comboAt, setComboAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  // Null until read from the phone.
  const [firstLaunch, setFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BOOT_SEEN_KEY)
      .then((seen) => setFirstLaunch(seen == null))
      .catch(() => setFirstLaunch(false));
  }, []);

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
    if (firstLaunch) {
      setSlow(true);
      return;
    }
    if (ready || stillAt == null) return;
    const t = setTimeout(() => setSlow(true), STILL_MS);
    return () => clearTimeout(t);
  }, [firstLaunch, ready, stillAt]);

  const finish = useCallback(() => {
    if (firstLaunch) AsyncStorage.setItem(BOOT_SEEN_KEY, "1").catch(() => {});
    onDone();
  }, [firstLaunch, onDone]);

  useEffect(() => {
    if (!ready || stillAt == null || firstLaunch == null) return;
    if (comboAt == null) {
      // Still in his guard: go now, unless the first launch's combo is
      // about to start.
      if (!firstLaunch) finish();
      return;
    }
    const elapsed = Date.now() - comboAt;
    const t = setTimeout(finish, comboEnd(elapsed, firstLaunch) - elapsed);
    return () => clearTimeout(t);
  }, [ready, stillAt, comboAt, firstLaunch, finish]);

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
        {slow && (
          <Image source={COMBO} style={StyleSheet.absoluteFill} contentFit="contain" onDisplay={showCombo} onError={showCombo} />
        )}
      </View>
      <StatusBar style="light" />
    </Animated.View>
  );
}
