export type ThemeMode = "dark" | "light";

export type Palette = {
  bg: string;
  navBar: string;
  loginBg: string;
  card: string;
  inset: string;
  surface2: string;
  heroTint: string;
  redTint: string;
  input: string;
  border: string;
  borderStrong: string;
  loginBorder: string;
  text: string;
  text2: string;
  textMuted: string;
  textFaint: string;
  red: string;
  green: string;
  blue: string;
  logoText: string;
  overlay: string;
  statusBar: "light" | "dark";
};

export const darkPalette: Palette = {
  bg: "#0A0A0A",
  navBar: "#0d0d0d",
  loginBg: "#1a0a0a",
  card: "#141414",
  inset: "#0f0f0f",
  surface2: "#161616",
  heroTint: "#160B0E",
  redTint: "#1a0d12",
  input: "#181818",
  border: "#222224",
  borderStrong: "#2a2a2a",
  loginBorder: "#3a1a1a",
  text: "#FFFFFF",
  text2: "#cccccc",
  textMuted: "#888888",
  textFaint: "#666666",
  red: "#E8003D",
  green: "#2ecc71",
  blue: "#5aa9e6",
  logoText: "#f5d0c5",
  overlay: "rgba(0,0,0,0.92)",
  statusBar: "light",
};

export const lightPalette: Palette = {
  bg: "#F2F2F6",
  navBar: "#FFFFFF",
  loginBg: "#FFF4F5",
  card: "#FFFFFF",
  inset: "#F6F6F9",
  surface2: "#F1F1F4",
  heroTint: "#FDE9ED",
  redTint: "#FDE9ED",
  input: "#ECECF0",
  border: "#E3E3E9",
  borderStrong: "#D3D3DA",
  loginBorder: "#F0D3D6",
  text: "#0A0A0A",
  text2: "#3A3A3A",
  textMuted: "#5A5A5A",
  textFaint: "#8A8A90",
  red: "#E8003D",
  green: "#009E42",
  blue: "#2F6FB0",
  logoText: "#C2412C",
  overlay: "rgba(0,0,0,0.45)",
  statusBar: "dark",
};

export const palettes: Record<ThemeMode, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};
