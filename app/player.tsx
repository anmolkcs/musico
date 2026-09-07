import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import TrackPlayer, { State, usePlaybackState, useProgress } from "react-native-track-player";
import LyricsView from "@/components/LyricsView";
import { useTheme } from "@/components/Theme";
import { cycleRepeat, playNext, playPrevious, togglePlayPause, toggleShuffle } from "@/lib/player";
import { formatDuration } from "@/lib/types";
import { useQueueStore } from "@/store/queue";
import { useLibraryStore } from "@/store/library";

export default function PlayerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playbackState = usePlaybackState();
  const { position, duration } = useProgress(500);
  const { songs, index, shuffle, repeat, sourceName } = useQueueStore();
  const song = songs[index] ?? null;
  const liked = useLibraryStore((s) => s.liked);
  const likedSet = React.useMemo(() => new Set(liked.map((t) => t.id)), [liked]);
  const like = useLibraryStore((s) => s.like);
  const [showLyrics, setShowLyrics] = useState(false);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [volume, setVolumeState] = useState(0.8);

  React.useEffect(() => {
    TrackPlayer.getVolume().then(setVolumeState).catch(() => {});
  }, []);

  const playing = playbackState?.state === State.Playing || playbackState?.state === State.Buffering;

  // swipe-down to dismiss
  const dismissRef = useRef(router);
  dismissRef.current = router;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 1.2) dismissRef.current.back();
      },
    })
  ).current;

  if (!song) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <CloseButton />
        <View style={styles.emptyWrap}>
          <Ionicons name="musical-notes-outline" size={44} color={colors.muted} />
          <Text style={{ color: colors.muted, marginTop: 10 }}>Nothing playing</Text>
        </View>
      </View>
    );
  }

  const isLiked = likedSet.has(song.id);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
        <LinearGradient
          colors={[colors.card, colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
          <View style={styles.topRow}>
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Ionicons name="chevron-down" size={28} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={[styles.source, { color: colors.muted }]} numberOfLines={1}>
                {sourceName ? sourceLabel(sourceName) : "NOW PLAYING"}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={() => setShowLyrics((v) => !v)}>
              <Ionicons
                name="text"
                size={24}
                color={showLyrics ? colors.accent : colors.muted}
              />
            </Pressable>
          </View>

          {showLyrics ? (
            <View style={styles.lyricsWrap}>
              <LyricsView song={song} />
            </View>
          ) : (
            <>
              <View style={styles.artWrap} pointerEvents="none">
                <Image
                  source={{ uri: song.thumbnail || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg` }}
                  style={styles.art}
                  contentFit="cover"
                  transition={200}
                />
              </View>
              <View style={styles.titleWrap}>
                <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
                  {song.title}
                </Text>
                <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
                  {song.artist || "Unknown artist"}
                </Text>
              </View>
            </>
          )}

          <View style={styles.seekWrap}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={Math.max(1, duration || song.duration || 1)}
              value={Math.min(seeking ?? position, Math.max(1, duration || song.duration || 1))}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.accent}
              onSlidingStart={(v) => setSeeking(v)}
              onSlidingComplete={async (v) => {
                setSeeking(null);
                await TrackPlayer.seekTo(v);
              }}
            />
            <View style={styles.times}>
              <Text style={[styles.time, { color: colors.muted }]}>{formatDuration(seeking ?? position)}</Text>
              <Text style={[styles.time, { color: colors.muted }]}>
                -{formatDuration(Math.max(0, (duration || song.duration || 0) - (seeking ?? position)))}
              </Text>
            </View>
          </View>

          <View style={styles.controlsRow}>
            <Pressable hitSlop={12} onPress={toggleShuffle}>
              <Ionicons name="shuffle" size={24} color={shuffle ? colors.accent : colors.muted} />
            </Pressable>
            <Pressable hitSlop={12} onPress={() => playPrevious()}>
              <Ionicons name="play-skip-back" size={34} color={colors.text} />
            </Pressable>
            <Pressable
              style={[styles.playButton, { backgroundColor: colors.text }]}
              onPress={async () => {
                setSpinning(true);
                await togglePlayPause();
                setSpinning(false);
              }}
            >
              {spinning && !playing ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Ionicons
                  name={playing ? "pause" : "play"}
                  size={30}
                  color={colors.background}
                  style={playing ? undefined : { marginLeft: 3 }}
                />
              )}
            </Pressable>
            <Pressable hitSlop={12} onPress={() => playNext(false)}>
              <Ionicons name="play-skip-forward" size={34} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={12} onPress={cycleRepeat}>
              <Ionicons name="repeat" size={24} color={repeat !== "off" ? colors.accent : colors.muted} />
              {repeat === "track" && <View style={[styles.repeatOne, { backgroundColor: colors.accent }]} />}
            </Pressable>
          </View>

          <View style={styles.bottomRow}>
            <Pressable hitSlop={12} onPress={() => like(song, !isLiked)}>
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={24} color={isLiked ? colors.accent : colors.muted} />
            </Pressable>
            <Slider
              style={styles.volume}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              minimumTrackTintColor={colors.muted}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.muted}
              onValueChange={(v) => {
                setVolumeState(v);
                TrackPlayer.setVolume(v).catch(() => {});
              }}
            />
            <Ionicons name="volume-high" size={20} color={colors.muted} />
          </View>
        </View>
      </View>
  );
}

function CloseButton() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable hitSlop={12} onPress={() => router.back()} style={{ padding: 12 }}>
      <Ionicons name="chevron-down" size={28} color={colors.text} />
    </Pressable>
  );
}

function sourceLabel(source: string): string {
  return source.toUpperCase();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    height: 44,
  },
  source: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  lyricsWrap: {
    flex: 1,
    marginTop: 8,
  },
  artWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  art: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#2A2A33",
  },
  titleWrap: {
    paddingHorizontal: 28,
    paddingTop: 20,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
  },
  artist: {
    fontSize: 15,
  },
  seekWrap: {
    paddingHorizontal: 24,
    marginTop: 6,
  },
  slider: {
    width: "100%",
    height: 32,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 6,
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatOne: {
    position: "absolute",
    right: -2,
    top: 16,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 28,
    paddingTop: 14,
  },
  volume: {
    flex: 1,
    height: 26,
  },
});
