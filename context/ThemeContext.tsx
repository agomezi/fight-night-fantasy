import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Palette, palettes, ThemeMode } from "../constants/palette";

const STORAGE_KEY = "fnf.theme";

type ThemeContextValue = {
  mode: ThemeMode;
  c: Palette;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark") setModeState(saved);
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      c: palettes[mode],
      setMode,
      toggle: () => setMode(mode === "dark" ? "light" : "dark"),
      ready,
    }),
    [mode, ready]
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
