import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "fnf.profile";

export type Profile = {
  username: string;
  title: string;
  favDivision: string;
  bio: string;
};

const DEFAULT_PROFILE: Profile = {
  username: "ELITE_STRIKER",
  title: "Tactical Specialist",
  favDivision: "Heavyweight",
  bio: "Never missed a main event. Locked in since UFC 280.",
};

type ProfileContextValue = {
  profile: Profile;
  updateProfile: (next: Profile) => void;
  ready: boolean;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(saved) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const updateProfile = (next: Profile) => {
    setProfile(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, updateProfile, ready }),
    [profile, ready]
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
