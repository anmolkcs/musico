import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TrackPlayer from "react-native-track-player";
import { PlaybackService, setupPlayer } from "@/lib/player";
import { useLibraryStore } from "@/store/library";
import { useDownloadsStore } from "@/lib/downloads";
import TrackMenu from "@/components/TrackMenu";
import MiniPlayer from "@/components/MiniPlayer";
import { ThemeProvider as MusicoThemeProvider, useEffectiveThemeMode } from "@/components/Theme";
import { themeFor } from "@/lib/theme";

// Register the RNTP playback service (also runs in the headless context)
TrackPlayer.registerPlaybackService(() => PlaybackService);

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const theme = useEffectiveThemeMode();
  const accentTheme = useLibraryStore((s) => s.accentTheme);
  const accent = themeFor(theme, accentTheme).accent;
  const pathname = usePathname();
  const showMiniPlayer =
    pathname !== "/player" &&
    !pathname.startsWith("/player/") &&
    pathname !== "/downloads" &&
    pathname !== "/settings";

  useEffect(() => {
    (async () => {
      try {
        await setupPlayer();
      } catch (e) {
        console.warn("player setup failed", e);
      }
      try {
        await useLibraryStore.getState().hydrate();
      } catch (e) {
        console.warn("library hydration failed", e);
      }
      try {
        await useDownloadsStore.getState().resetStale();
      } catch (e) {
        console.warn("download cleanup failed", e);
      }
    })();
  }, []);

  const navTheme =
    theme === "dark"
      ? {
          ...DarkTheme,
          colors: { ...DarkTheme.colors, background: "#0B0B0F", card: "#17171D", primary: accent },
        }
      : {
          ...DefaultTheme,
          colors: { ...DefaultTheme.colors, background: "#F6F6F9", card: "#FFFFFF", primary: accent },
        };

  return (
    <SafeAreaProvider>
      <MusicoThemeProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <View style={{ flex: 1, backgroundColor: navTheme.colors.background }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
              <Stack.Screen
                name="player"
                options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
              />
              <Stack.Screen name="downloads" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            </Stack>
            <TrackMenu />
            {showMiniPlayer && <MiniPlayer />}
          </View>
        </ThemeProvider>
      </MusicoThemeProvider>
    </SafeAreaProvider>
  );
}
