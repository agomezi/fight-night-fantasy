import { Anton_400Regular } from "@expo-google-fonts/anton";
import { BebasNeue_400Regular, useFonts } from "@expo-google-fonts/bebas-neue";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ProfileProvider } from "../context/ProfileContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { c } = useTheme();
  const { session, ready } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Hold the splash screen until the saved session has been read, so a
  // signed-in user never sees the login screen flash.
  if (!ready) return null;

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
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="home" />
          <Stack.Screen name="picks" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="leagues" />
          <Stack.Screen name="league-standings" />
          <Stack.Screen name="matchup" />
          <Stack.Screen name="history" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="league-settings" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="edit-profile" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={c.statusBar} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue: BebasNeue_400Regular,
    Anton: Anton_400Regular,
  });

  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <ProfileProvider>
            <ThemedApp />
          </ProfileProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
