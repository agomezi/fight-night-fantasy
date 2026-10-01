import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { profileStorageKey } from "../constants/storage";
import { supabase } from "../services/supabase";

GoogleSignin.configure({
  // The ID token is issued for the web client, which is the one Supabase verifies.
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

type AuthContextValue = {
  session: Session | null;
  ready: boolean;
  // Each resolves false if the user backed out of the provider's sheet.
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function signInWithApple(): Promise<boolean> {
  // Apple gets the hash of the nonce and Supabase the raw value, so a stolen
  // ID token can't be replayed in another sign-in.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === "ERR_REQUEST_CANCELED") return false;
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple did not return an identity token");

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  return true;
}

async function signInWithGoogle(): Promise<boolean> {
  await GoogleSignin.hasPlayServices();

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return false;
    throw e;
  }
  if (!isSuccessResponse(response)) return false;
  if (!response.data.idToken) throw new Error("Google did not return an ID token");

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: response.data.idToken,
  });
  if (error) throw error;
  return true;
}

// Forget the Google account too, so the next sign-in offers the account picker.
async function forgetGoogle() {
  await GoogleSignin.signOut().catch(() => {});
}

async function signOut() {
  await forgetGoogle();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function deleteAccount() {
  const { data } = await supabase.auth.getSession();
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;
  if (data.session) {
    await AsyncStorage.removeItem(profileStorageKey(data.session.user.id)).catch(() => {});
  }
  await forgetGoogle();
  // The account no longer exists server-side, so only the local session is left to clear.
  await supabase.auth.signOut({ scope: "local" });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, ready, signInWithApple, signInWithGoogle, signOut, deleteAccount }),
    [session, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
