import {
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  Unbounded_700Bold,
  Unbounded_900Black,
  useFonts,
} from "@expo-google-fonts/unbounded";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ProfileProvider } from "../context/ProfileContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { c } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 120,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="home" />
        <Stack.Screen name="picks" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="leagues" />
        <Stack.Screen name="league-standings" />
        <Stack.Screen name="matchup" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="edit-profile" />
      </Stack>
      <StatusBar style={c.statusBar} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Unbounded: Unbounded_700Bold,
    UnboundedBlack: Unbounded_900Black,
    PlexSans: IBMPlexSans_400Regular,
    PlexSansMed: IBMPlexSans_600SemiBold,
    PlexSansBold: IBMPlexSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ProfileProvider>
          <ThemedApp />
        </ProfileProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
