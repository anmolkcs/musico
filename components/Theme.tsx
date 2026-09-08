import { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import { useLibraryStore } from "../store/library";
import { ThemeColors, themeFor } from "../lib/theme";

type ThemeContextValue = {
  mode: "dark" | "light";
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  colors: themeFor("dark"),
});

/** Effective theme: explicit user choice if set, otherwise the OS setting. */
export function useEffectiveThemeMode(): "dark" | "light" {
  const stored = useLibraryStore((s) => s.theme);
  const osScheme = useColorScheme();
  return stored ?? (osScheme === "light" ? "light" : "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useEffectiveThemeMode();
  const accentTheme = useLibraryStore((s) => s.accentTheme);
  return <ThemeContext.Provider value={{ mode, colors: themeFor(mode, accentTheme) }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
