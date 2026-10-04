// Registering this phone for push notifications, and the player's choices
// about which ones they get. The server decides what to send and when; this
// only hands it a token and the preferences.

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const TOKEN_KEY = "push-token";

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushPermission = "granted" | "denied" | "undetermined";

export async function pushPermission(): Promise<PushPermission> {
  if (!Device.isDevice) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Registers this phone with the server if notifications are allowed. With
 * `ask`, prompts for permission first when the player hasn't been asked yet.
 * Returns the resulting permission. Never throws: notifications are optional.
 */
export async function enablePush(ask: boolean): Promise<PushPermission> {
  try {
    if (!Device.isDevice) return "denied";
    let { status } = await Notifications.getPermissionsAsync();
    if (status === "undetermined" && ask) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return status;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { supabase } = await import("./supabase");
    const { error } = await supabase.rpc("register_push_token", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
    if (!error) await AsyncStorage.setItem(TOKEN_KEY, token);
    return "granted";
  } catch {
    return "undetermined";
  }
}

/** Stops this phone getting the signed-in player's notifications. Called on
 * sign-out, while the session is still valid. */
export async function disablePush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const { supabase } = await import("./supabase");
    await supabase.rpc("unregister_push_token", { token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export type NotifyPrefs = { notify_reminders: boolean; notify_results: boolean; notify_summary: boolean };

export async function loadNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("profiles")
    .select("notify_reminders, notify_results, notify_summary")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data as NotifyPrefs;
}

export async function saveNotifyPref(userId: string, key: keyof NotifyPrefs, value: boolean): Promise<void> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", userId);
  if (error) throw new Error(error.message);
}
