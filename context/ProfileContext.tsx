import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LEGACY_PROFILE_KEY, profileStorageKey } from "../constants/storage";
import { fetchDisplayName, nextNameChange, saveDisplayName, saveFavDivision } from "../services/profile";
import { useAuth } from "./AuthContext";

export type Profile = {
  /** The handle on the Supabase profile. Empty until onboarding sets it. */
  username: string;
  title: string;
  favDivision: string;
  bio: string;
};

/** The parts of the profile kept on this phone, per account. The favorite
 * division is also saved to the server, where league mates see it. */
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
        if (!raw) return null;
        // Older saves also held a username; the handle now lives on the server.
        const { username: _old, ...rest } = JSON.parse(raw);
        const stored: LocalProfile = { ...DEFAULT_LOCAL, ...rest };
        if (current) setLocal(stored);
        return stored;
      })
      .catch(() => null);
    const name = fetchDisplayName(userId)
      .then((server) => {
        if (!current) return null;
        setUsernameState(server.name);
        setNameChangedAt(server.changedAt);
        return server;
      })
      // Offline at launch: let them in rather than trapping them in
      // onboarding; the next launch reads it again.
      .catch(() => {
        if (current) setUsernameState("");
        return null;
      });
    Promise.all([saved, name])
      .then(([stored, server]) => {
        if (!current || !server) return;
        // The server's division wins. One chosen before it was saved there is
        // sent up once, so league mates see it.
        if (server.favDivision) setLocal((l) => ({ ...l, favDivision: server.favDivision! }));
        else if (stored?.favDivision) saveFavDivision(userId, stored.favDivision).catch(() => {});
      })
      .finally(() => current && setReady(true));
    return () => {
      current = false;
    };
  }, [userId]);

  const updateProfile = useCallback(
    (next: LocalProfile) => {
      if (userId) {
        AsyncStorage.setItem(profileStorageKey(userId), JSON.stringify(next)).catch(() => {});
        if (next.favDivision && next.favDivision !== local.favDivision) {
          saveFavDivision(userId, next.favDivision).catch(() => {});
        }
      }
      setLocal(next);
    },
    [userId, local.favDivision]
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
