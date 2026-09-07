export const ACCENT = "#FA233B";

export type ThemeColors = {
  background: string;
  card: string;
  elevated: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  tabBar: string;
};

export const dark: ThemeColors = {
  background: "#0B0B0F",
  card: "#17171D",
  elevated: "#222229",
  text: "#FFFFFF",
  muted: "#9A9AA5",
  border: "#2A2A33",
  accent: ACCENT,
  tabBar: "rgba(11,11,15,0.85)",
};

export const light: ThemeColors = {
  background: "#F6F6F9",
  card: "#FFFFFF",
  elevated: "#ECECF2",
  text: "#111117",
  muted: "#6E6E7A",
  border: "#DDDDE4",
  accent: ACCENT,
  tabBar: "rgba(255,255,255,0.9)",
};

export function themeFor(mode: "dark" | "light"): ThemeColors {
  return mode === "dark" ? dark : light;
}
