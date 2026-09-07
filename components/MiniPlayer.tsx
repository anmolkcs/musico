import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveTrack, usePlaybackState, State, useProgress } from "react-native-track-player";
import { artworkFor } from "../lib/types";
import { playNext, togglePlayPause } from "../lib/player";
import { useTheme } from "./Theme";

export default function MiniPlayer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const track = useActiveTrack();
  const state = usePlaybackState();
  const playing = state?.state === State.Playing || state?.state === State.Buffering;

  if (!track) return null;

  return (
    <View style={[styles.wrap, { bottom: 56 + insets.bottom }]} pointerEvents="box-none">
      <Pressable
        style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push("/player")}
      >
        <View style={styles.progressTrack}>
          <MiniProgress color={colors.accent} />
        </View>
        <Image
          source={{ uri: track.artwork ?? artworkFor(String(track.id)) }}
          style={styles.art}
          contentFit="cover"
        />
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
            {track.artist}
          </Text>
        </View>
        <Pressable
          onPress={togglePlayPause}
          hitSlop={12}
          style={[styles.button, { backgroundColor: colors.elevated }]}
        >
          <Ionicons
            name={playing ? "pause" : "play"}
            size={22}
            color={colors.text}
            style={playing ? undefined : styles.playIcon}
          />
        </Pressable>
        <Pressable onPress={() => playNext(false)} hitSlop={12} style={styles.button}>
          <Ionicons name="play-forward" size={22} color={colors.text} />
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
    left: 10,
    right: 10,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
    borderRadius: 8,
    backgroundColor: "#2A2A33",
  },
  meta: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  artist: {
    fontSize: 12,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    marginLeft: 2,
  },
});
