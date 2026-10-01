import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { Palette, palettes, ThemeMode } from "../constants/palette";

const STORAGE_KEY = "fnf.themePreference";
// Before the app followed the system, this held a forced light/dark choice.
const LEGACY_STORAGE_KEY = "fnf.theme";

/** "system" follows the phone's appearance setting, live. */
export type ThemePreference = ThemeMode | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  c: Palette;
  setPreference: (preference: ThemePreference) => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark" || saved === "system") {
          setPreferenceState(saved);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const mode: ThemeMode =
    preference === "system" ? (system === "light" ? "light" : "dark") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, preference, c: palettes[mode], setPreference, ready }),
    [mode, preference, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => factory(c), [c, factory]);
}
