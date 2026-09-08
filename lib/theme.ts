export type AccentTheme = "ruby" | "ocean" | "emerald" | "violet" | "amber";

export const ACCENT_THEMES: { key: AccentTheme; label: string; color: string }[] = [
  { key: "ruby", label: "Ruby", color: "#FA233B" },
  { key: "ocean", label: "Ocean", color: "#2E7CF6" },
  { key: "emerald", label: "Emerald", color: "#1DB954" },
  { key: "violet", label: "Violet", color: "#9B6DFF" },
  { key: "amber", label: "Amber", color: "#F6A623" },
];

export const ACCENT = ACCENT_THEMES[0].color;

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

export function themeFor(mode: "dark" | "light", accent: AccentTheme = "ruby"): ThemeColors {
  const base = mode === "dark" ? dark : light;
  return { ...base, accent: ACCENT_THEMES.find((item) => item.key === accent)?.color ?? ACCENT };
}
