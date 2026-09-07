import { createContext, useContext } from "react";
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Persisted user choice from the library store; dark until hydrated.
  const mode = useLibraryStore((s) => s.theme);
  return <ThemeContext.Provider value={{ mode, colors: themeFor(mode) }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
