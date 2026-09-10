import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveTrack, usePlaybackState, State, useProgress } from "react-native-track-player";
import { artworkFor } from "../lib/types";
import { SANS } from "../lib/theme";
import { playNext, togglePlayPause } from "../lib/player";
import { useTheme } from "./Theme";
import { useQueueStore } from "../store/queue";

export default function MiniPlayer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const track = useActiveTrack();
  const queuedSong = useQueueStore((s) => s.songs[s.index]);
  const loading = useQueueStore((s) => s.loading);
  const state = usePlaybackState();
  const playing = state?.state === State.Playing || state?.state === State.Buffering;
  const displayTrack = loading && queuedSong ? queuedSong : track ?? queuedSong;
  const artwork = displayTrack && ("artwork" in displayTrack ? displayTrack.artwork : displayTrack.thumbnail);

  if (!displayTrack) return null;

  // The tab bar only exists on the three tab roots. Everywhere else
  // (history, playlist detail, import, artist…) the bar must sit just
  // above the bottom safe area instead of floating in mid-air.
  const hasTabBar = pathname === "/" || pathname === "/search" || pathname === "/library";
  const bottom = hasTabBar ? 64 + insets.bottom : insets.bottom + 12;

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={[styles.bar, { backgroundColor: colors.tabBar, borderColor: colors.border }]}
        onPress={() => router.push("/player")}
      >
        <View style={styles.progressTrack}>
          <MiniProgress color={colors.accent} />
        </View>
        <Image
          source={{ uri: artwork ?? artworkFor(String(displayTrack.id)) }}
          style={[styles.art, { backgroundColor: colors.elevated }]}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {displayTrack.title}
          </Text>
          <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
            {displayTrack.artist}
          </Text>
        </View>
        <Pressable
          onPress={togglePlayPause}
          hitSlop={12}
          style={({ pressed }) => [styles.playButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Ionicons
              name={playing ? "pause" : "play"}
              size={20}
              color={colors.onAccent}
              style={playing ? undefined : styles.playIcon}
            />
          )}
        </Pressable>
        <Pressable onPress={() => playNext(false)} hitSlop={12} style={styles.nextButton}>
          <Ionicons name="play-forward" size={22} color={colors.muted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function MiniProgress({ color }: { color: string }) {
  const { position, duration } = useProgress(500);
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  return <View style={[styles.progressBar, { width: `${pct * 100}%`, backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 6,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  progressTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  progressBar: {
    height: 2,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  artist: {
    fontFamily: SANS.regular,
    fontSize: 12,
    lineHeight: 15,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    marginLeft: 2,
  },
  nextButton: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
