import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LEGACY_PROFILE_KEY, profileStorageKey } from "../constants/storage";
import { renameUnderReview as saveRenameUnderReview } from "../services/nameReview";
import { fetchDisplayName, fetchNameRemoved, nextNameChange, saveDisplayName, saveFavDivision } from "../services/profile";
import type { AwardId } from "../services/awards";
import { loadTitle, saveTitle } from "../services/titles";
import { useAuth } from "./AuthContext";

export type Profile = {
  /** The handle on the Supabase profile. Empty until onboarding sets it. */
  username: string;
  /** The award worn as a title, from the server; null with none. */
  title: AwardId | null;
  favDivision: string;
  bio: string;
};

/** The parts of the profile kept on this phone, per account. The favorite
 * division is also saved to the server, where league mates see it. */
type LocalProfile = Omit<Profile, "username" | "title">;

const DEFAULT_LOCAL: LocalProfile = {
  // Empty until the player picks one, so nobody gets a division they never chose.
  favDivision: "",
  bio: "Never missed a main event. Locked in since UFC 280.",
};

type ProfileContextValue = {
  profile: Profile;
  /** Saves the on-phone fields. */
  updateProfile: (next: LocalProfile) => void;
  /** Wears an award you've won as your title; null takes it off. */
  setTitle: (award: AwardId | null) => Promise<void>;
  /** Reads the title again, as after its award is taken back. */
  refreshTitle: () => void;
  /** Saves the handle to Supabase; throws HandleTakenError if it is taken. */
  setUsername: (name: string) => Promise<void>;
  /** A rename while your name is hidden by reports. */
  renameUnderReview: (name: string) => Promise<void>;
  /** Reads the name from the server again, as after a moderator restores one. */
  refreshName: () => void;
  /** When the handle can next be changed; null when it can be now. */
  nameChangeableAt: Date | null;
  /** True once the handle has been read, so routing can wait for it. */
  ready: boolean;
  /** Signed in with no handle yet: onboarding comes first. */
  needsOnboarding: boolean;
  /** Your handle was removed: the app asks for a new one instead of onboarding. */
  nameRemoved: boolean;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [local, setLocal] = useState<LocalProfile>(DEFAULT_LOCAL);
  const [username, setUsernameState] = useState<string | null>(null);
  const [nameChangedAt, setNameChangedAt] = useState<Date | null>(null);
  const [title, setTitleState] = useState<AwardId | null>(null);
  const [nameRemoved, setNameRemoved] = useState(false);
  const [ready, setReady] = useState(false);

  // Reload whenever the signed-in account changes, so one account's profile
  // never carries over to the next.
  useEffect(() => {
    AsyncStorage.removeItem(LEGACY_PROFILE_KEY).catch(() => {});
    setLocal(DEFAULT_LOCAL);
    setUsernameState(null);
    setNameChangedAt(null);
    setTitleState(null);
    setNameRemoved(false);
    if (!userId) {
      setReady(true);
      return;
    }
    setReady(false);
    let current = true;
    const saved = AsyncStorage.getItem(profileStorageKey(userId))
      .then((raw) => {
        if (!raw) return null;
        // Older saves also held a username and a title; both live on the server now.
        const { username: _old, title: _oldTitle, ...rest } = JSON.parse(raw);
        const stored: LocalProfile = { ...DEFAULT_LOCAL, ...rest };
        if (current) setLocal(stored);
        return stored;
      })
      .catch(() => null);
    const name = Promise.all([fetchDisplayName(userId), fetchNameRemoved(userId)])
      .then(([server, removed]) => {
        if (!current) return null;
        setUsernameState(server.name);
        setNameChangedAt(server.changedAt);
        setNameRemoved(server.name === null && removed);
        return server;
      })
      // Offline at launch: let them in rather than trapping them in
      // onboarding; the next launch reads it again.
      .catch(() => {
        if (current) setUsernameState("");
        return null;
      });
    loadTitle(userId)
      .then((t) => current && setTitleState(t))
      .catch(() => {});
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
      setNameRemoved(false);
    },
    [userId]
  );

  // The account a refresh was started for, so a late answer for one account
  // never lands on the next.
  const accountRef = useRef(userId);
  accountRef.current = userId;
  const refreshName = useCallback(() => {
    if (!userId) return;
    fetchDisplayName(userId)
      .then((server) => {
        if (accountRef.current !== userId || server.name === null) return;
        setUsernameState(server.name);
        setNameChangedAt(server.changedAt);
      })
      .catch(() => {});
  }, [userId]);

  // Bumped on every save, so a read started before it can't undo it.
  const titleSaves = useRef(0);
  const setTitle = useCallback(
    async (award: AwardId | null) => {
      titleSaves.current += 1;
      await saveTitle(award);
      if (accountRef.current === userId) setTitleState(award);
    },
    [userId]
  );

  const refreshTitle = useCallback(() => {
    if (!userId) return;
    const saves = titleSaves.current;
    loadTitle(userId)
      .then((t) => accountRef.current === userId && saves === titleSaves.current && setTitleState(t))
      .catch(() => {});
  }, [userId]);

  const renameUnderReview = useCallback(async (name: string) => {
    await saveRenameUnderReview(name);
    setUsernameState(name);
    setNameChangedAt(new Date());
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile: { ...local, username: username ?? "", title },
      updateProfile,
      setTitle,
      refreshTitle,
      setUsername,
      renameUnderReview,
      refreshName,
      nameChangeableAt: nextNameChange(nameChangedAt),
      ready,
      needsOnboarding: !!userId && ready && username === null && !nameRemoved,
      nameRemoved: !!userId && ready && username === null && nameRemoved,
    }),
    [local, username, title, nameChangedAt, nameRemoved, updateProfile, setTitle, refreshTitle, setUsername, renameUnderReview, refreshName, ready, userId]
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
