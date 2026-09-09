import { TextStyle, ViewStyle } from "react-native";

/**
 * Cadence design system — Warm Editorial Minimalism × Tactile Analog Glassmorphism.
 * Surfaces are warm soot/charcoal (never pure black), text is soft ivory,
 * and terracotta amber is the single interactive accent.
 */

export type AccentTheme = "ruby" | "ocean" | "emerald" | "violet" | "amber";

// Keys are legacy (persisted in settings storage); the palette itself is Cadence-warm.
export const ACCENT_THEMES: { key: AccentTheme; label: string; color: string }[] = [
  { key: "ruby", label: "Terracotta", color: "#D97736" },
  { key: "ocean", label: "Ember", color: "#C2632B" },
  { key: "emerald", label: "Bronze", color: "#8C6E54" },
  { key: "violet", label: "Clay", color: "#A85B32" },
  { key: "amber", label: "Amber", color: "#E09A52" },
];

export const ACCENT = ACCENT_THEMES[0].color;

export type ThemeColors = {
  background: string;
  card: string; // Level 1 — recessed trays, list substrates
  elevated: string; // Level 2 — cards, sheets, popovers
  surfaceHighest: string; // Level 3 — floating controls
  text: string;
  muted: string;
  faint: string; // aged stone — metadata, timestamps
  border: string; // ghost hairline
  borderStrong: string;
  accent: string;
  accentSoft: string; // amber wash for selected chips/washes
  onAccent: string; // icon/text on accent fills
  copper: string;
  tabBar: string;
  backdrop: string;
};

export const dark: ThemeColors = {
  background: "#141312",
  card: "#1C1A18",
  elevated: "#262320",
  surfaceHighest: "#2E2A27",
  text: "#F7F4EE",
  muted: "#A8A196",
  faint: "#736B63",
  border: "rgba(247,244,238,0.08)",
  borderStrong: "rgba(247,244,238,0.14)",
  accent: ACCENT,
  accentSoft: "rgba(217,119,54,0.15)",
  onAccent: "#1B0F05",
  copper: "#C2632B",
  tabBar: "rgba(20,19,18,0.88)",
  backdrop: "rgba(10,9,8,0.62)",
};

export const light: ThemeColors = {
  background: "#F7F4EE",
  card: "#FFFFFF",
  elevated: "#EFE9E0",
  surfaceHighest: "#E6DED2",
  text: "#201C18",
  muted: "#6E655A",
  faint: "#988D80",
  border: "rgba(32,28,24,0.10)",
  borderStrong: "rgba(32,28,24,0.18)",
  accent: "#C2632B",
  accentSoft: "rgba(194,99,43,0.14)",
  onAccent: "#FFF7F0",
  copper: "#A95322",
  tabBar: "rgba(247,244,238,0.92)",
  backdrop: "rgba(32,28,24,0.40)",
};

export function themeFor(mode: "dark" | "light", accent: AccentTheme = "ruby"): ThemeColors {
  const base = mode === "dark" ? dark : light;
  return { ...base, accent: ACCENT_THEMES.find((item) => item.key === accent)?.color ?? ACCENT };
}

/** Editorial serif (Newsreader) for album titles, heroes, liner moments. */
export const SERIF = {
  regular: "Newsreader_400Regular",
  medium: "Newsreader_500Medium",
  semiBold: "Newsreader_600SemiBold",
  italic: "Newsreader_400Regular_Italic",
  mediumItalic: "Newsreader_500Medium_Italic",
} as const;

/** Structural sans (Plus Jakarta Sans) for UI, metadata, body. */
export const SANS = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semiBold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;


/** Cadence type scale, tuned for mobile. */
export const TYPE = {
  display: { fontFamily: SERIF.regular, fontSize: 34, lineHeight: 42, letterSpacing: -0.5 } as TextStyle,
  headline: { fontFamily: SERIF.medium, fontSize: 24, lineHeight: 31, letterSpacing: -0.2 } as TextStyle,
  headlineSm: { fontFamily: SERIF.medium, fontSize: 19, lineHeight: 25 } as TextStyle,
  title: { fontFamily: SANS.semiBold, fontSize: 16, lineHeight: 22, letterSpacing: -0.15 } as TextStyle,
  titleSm: { fontFamily: SANS.semiBold, fontSize: 14, lineHeight: 19 } as TextStyle,
  body: { fontFamily: SANS.regular, fontSize: 15, lineHeight: 22 } as TextStyle,
  bodySm: { fontFamily: SANS.regular, fontSize: 13, lineHeight: 18 } as TextStyle,
  label: { fontFamily: SANS.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.9 } as TextStyle,
  labelSm: { fontFamily: SANS.semiBold, fontSize: 10, lineHeight: 14, letterSpacing: 1.1 } as TextStyle,
};

/** Warm ambient shadow for elevated cards (umber-tinted, per spec). */
export const VINYL_SHADOW: ViewStyle = {
  shadowColor: "#000000",
  shadowOpacity: 0.65,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};
