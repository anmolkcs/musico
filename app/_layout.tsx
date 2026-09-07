import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React, { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TrackPlayer from "react-native-track-player";
import { PlaybackService, setupPlayer } from "@/lib/player";
import { useLibraryStore } from "@/store/library";
import { useDownloadsStore } from "@/lib/downloads";
import TrackMenu from "@/components/TrackMenu";
import { ThemeProvider as MusicoThemeProvider } from "@/components/Theme";

// Register the RNTP playback service (also runs in the headless context)
TrackPlayer.registerPlaybackService(() => PlaybackService);

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useLibraryStore((s) => (s.ready ? s.theme : colorScheme === "light" ? "light" : "dark"));

  useEffect(() => {
    (async () => {
      try {
        await setupPlayer();
      } catch (e) {
        console.warn("player setup failed", e);
      }
      await useLibraryStore.getState().hydrate();
      await useDownloadsStore.getState().resetStale().catch(() => {});
    })();
  }, []);

  const navTheme =
    theme === "dark"
      ? {
          ...DarkTheme,
          colors: { ...DarkTheme.colors, background: "#0B0B0F", card: "#17171D", primary: "#FA233B" },
        }
      : {
          ...DefaultTheme,
          colors: { ...DefaultTheme.colors, background: "#F6F6F9", card: "#FFFFFF", primary: "#FA233B" },
        };

  return (
    <SafeAreaProvider>
      <MusicoThemeProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <View style={{ flex: 1, backgroundColor: navTheme.colors.background }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="player"
                options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
              />
              <Stack.Screen name="downloads" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            </Stack>
            <TrackMenu />
          </View>
        </ThemeProvider>
      </MusicoThemeProvider>
    </SafeAreaProvider>
  );
}
