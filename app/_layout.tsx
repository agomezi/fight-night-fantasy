import { Anton_400Regular } from "@expo-google-fonts/anton";
import { BebasNeue_400Regular, useFonts } from "@expo-google-fonts/bebas-neue";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ProfileProvider, useProfile } from "../context/ProfileContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { notificationHref } from "../services/inbox";
import { enablePush } from "../services/push";

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { c } = useTheme();
  const { session, ready: authReady } = useAuth();
  const { ready: profileReady, needsOnboarding } = useProfile();
  const ready = authReady && profileReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Keep this phone registered for a signed-in player who has allowed
  // notifications. Asking for permission happens in context, not here.
  const signedInWithName = !!session && ready && !needsOnboarding;
  useEffect(() => {
    if (signedInWithName) enablePush(false);
  }, [signedInWithName]);

  // Tapping a notification opens the screen it is about.
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = notificationHref(response.notification.request.content.data);
      if (href) router.push(href);
    });
    return () => sub.remove();
  }, [router]);

  // Hold the splash screen until the saved session and the player's name have
  // been read, so nobody sees the login screen or onboarding flash.
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
        {/* A new account picks a name before anything else. */}
        <Stack.Protected guard={!!session && needsOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !needsOnboarding}>
          <Stack.Screen name="home" />
          <Stack.Screen name="picks" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="leagues" />
          <Stack.Screen name="league-standings" />
          <Stack.Screen name="matchup" />
          <Stack.Screen name="history" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="league-settings" />
          <Stack.Screen name="league-join" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="event/[id]" />
          <Stack.Screen name="leaderboard" />
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
