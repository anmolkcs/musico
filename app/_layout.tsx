import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TrackPlayer from "react-native-track-player";
import { PlaybackService, setupPlayer } from "@/lib/player";
import { useLibraryStore } from "@/store/library";
import { useDownloadsStore } from "@/lib/downloads";
import { themeFor } from "@/lib/theme";
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import TrackMenu from "@/components/TrackMenu";
import MiniPlayer from "@/components/MiniPlayer";
import { ThemeProvider as MusicoThemeProvider, useEffectiveThemeMode } from "@/components/Theme";

// Register the RNTP playback service (also runs in the headless context)
TrackPlayer.registerPlaybackService(() => PlaybackService);

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const theme = useEffectiveThemeMode();
  const accentTheme = useLibraryStore((s) => s.accentTheme);
  const colors = themeFor(theme, accentTheme);
  const pathname = usePathname();
  const showMiniPlayer =
    pathname !== "/player" &&
    !pathname.startsWith("/player/") &&
    pathname !== "/downloads" &&
    pathname !== "/settings";

  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_500Medium_Italic,
    Newsreader_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

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
          colors: {
            ...DarkTheme.colors,
            background: colors.background,
            card: colors.card,
            primary: colors.accent,
            text: colors.text,
            border: colors.border,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: colors.background,
            card: colors.card,
            primary: colors.accent,
            text: colors.text,
            border: colors.border,
          },
        };

  if (!fontsLoaded) return null;

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
