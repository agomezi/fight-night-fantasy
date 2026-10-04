import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LEGACY_PROFILE_KEY, profileStorageKey } from "../constants/storage";
import { fetchDisplayName, nextNameChange, saveDisplayName } from "../services/profile";
import { useAuth } from "./AuthContext";

export type Profile = {
  /** The handle on the Supabase profile. Empty until onboarding sets it. */
  username: string;
  title: string;
  favDivision: string;
  bio: string;
};

/** The parts of the profile kept on this phone, per account. */
type LocalProfile = Omit<Profile, "username">;

const DEFAULT_LOCAL: LocalProfile = {
  title: "Tactical Specialist",
  favDivision: "Heavyweight",
  bio: "Never missed a main event. Locked in since UFC 280.",
};

type ProfileContextValue = {
  profile: Profile;
  /** Saves the on-phone fields. */
  updateProfile: (next: LocalProfile) => void;
  /** Saves the handle to Supabase; throws HandleTakenError if it is taken. */
  setUsername: (name: string) => Promise<void>;
  /** When the handle can next be changed; null when it can be now. */
  nameChangeableAt: Date | null;
  /** True once the handle has been read, so routing can wait for it. */
  ready: boolean;
  /** Signed in with no handle yet: onboarding comes first. */
  needsOnboarding: boolean;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [local, setLocal] = useState<LocalProfile>(DEFAULT_LOCAL);
  const [username, setUsernameState] = useState<string | null>(null);
  const [nameChangedAt, setNameChangedAt] = useState<Date | null>(null);
  const [ready, setReady] = useState(false);

  // Reload whenever the signed-in account changes, so one account's profile
  // never carries over to the next.
  useEffect(() => {
    AsyncStorage.removeItem(LEGACY_PROFILE_KEY).catch(() => {});
    setLocal(DEFAULT_LOCAL);
    setUsernameState(null);
    setNameChangedAt(null);
    if (!userId) {
      setReady(true);
      return;
    }
    setReady(false);
    let current = true;
    const saved = AsyncStorage.getItem(profileStorageKey(userId))
      .then((raw) => {
        if (!current || !raw) return;
        // Older saves also held a username; the handle now lives on the server.
        const { username: _old, ...rest } = JSON.parse(raw);
        setLocal({ ...DEFAULT_LOCAL, ...rest });
      })
      .catch(() => {});
    const name = fetchDisplayName(userId)
      .then(({ name: n, changedAt }) => {
        if (!current) return;
        setUsernameState(n);
        setNameChangedAt(changedAt);
      })
      // Offline at launch: let them in rather than trapping them in
      // onboarding; the next launch reads it again.
      .catch(() => current && setUsernameState(""));
    Promise.all([saved, name]).finally(() => current && setReady(true));
    return () => {
      current = false;
    };
  }, [userId]);

  const updateProfile = useCallback(
    (next: LocalProfile) => {
      setLocal(next);
      if (userId) AsyncStorage.setItem(profileStorageKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [userId]
  );

  const setUsername = useCallback(
    async (name: string) => {
      if (!userId) throw new Error("Not signed in");
      await saveDisplayName(userId, name);
      setUsernameState(name);
      setNameChangedAt(new Date());
    },
    [userId]
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile: { ...local, username: username ?? "" },
      updateProfile,
      setUsername,
      nameChangeableAt: nextNameChange(nameChangedAt),
      ready,
      needsOnboarding: !!userId && ready && username === null,
    }),
    [local, username, nameChangedAt, updateProfile, setUsername, ready, userId]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}

export function getInitials(name: string): string {
  const words = name.trim().split(/[\s_]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
