import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import TrackPlayer, { State, usePlaybackState, useProgress } from "react-native-track-player";
import LyricsView from "@/components/LyricsView";
import { useTheme } from "@/components/Theme";
import { SANS, SERIF, VINYL_SHADOW } from "@/lib/theme";
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
  const upNext = songs[index + 1] ?? null;
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
          <Ionicons name="disc-outline" size={44} color={colors.faint} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Nothing playing</Text>
        </View>
      </View>
    );
  }

  const isLiked = likedSet.has(song.id);
  const total = Math.max(1, duration || song.duration || 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }}>
        {/* Header — dismiss, source context, lyrics */}
        <View style={styles.topRow}>
          <Pressable
            hitSlop={12}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.topButton, pressed && { backgroundColor: colors.elevated }]}
          >
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </Pressable>
          <View style={styles.sourceWrap}>
            <Text style={[styles.sourceEyebrow, { color: colors.faint }]} numberOfLines={1}>
              {sourceName && sourceName !== "queue"
                ? `Playing from ${sourceLabel(sourceName) ?? "your library"}`
                : "Now playing"}
            </Text>
            {sourceName && sourceName !== "queue" ? (
              <Text numberOfLines={1} style={[styles.sourceName, { color: colors.text }]}>
                {sourceDisplay(sourceName)}
              </Text>
            ) : null}
          </View>
          <Pressable
            hitSlop={12}
            onPress={() => setShowLyrics((v) => !v)}
            style={({ pressed }) => [
              styles.topButton,
              showLyrics && { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="book-outline" size={22} color={showLyrics ? colors.accent : colors.muted} />
          </Pressable>
        </View>

        {showLyrics ? (
          <View style={styles.lyricsWrap}>
            <LyricsView song={song} />
          </View>
        ) : (
          <>
            {/* Artwork — crisp sleeve, hairline frame, ambient shadow */}
            <View style={styles.artWrap} pointerEvents="none">
              <View style={[styles.artFrame, VINYL_SHADOW, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: song.thumbnail || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg` }}
                  style={styles.art}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
                <View style={[styles.statusChip, { backgroundColor: "rgba(20,19,18,0.72)", borderColor: "rgba(247,244,238,0.10)" }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.statusChipText, { color: colors.text }]}>NOW PLAYING</Text>
                </View>
              </View>
            </View>

            {/* Title block */}
            <View style={styles.titleRow}>
              <View style={styles.titleSide} />
              <View style={styles.titleCenter}>
                <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
                  {song.title}
                </Text>
                <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
                  {song.artist || "Unknown artist"}
                </Text>
              </View>
              <View style={styles.titleSide}>
                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    like(song, !isLiked).catch((error) =>
                      Alert.alert("Library error", error instanceof Error ? error.message : "Could not update liked songs")
                    )
                  }
                  style={({ pressed }) => [styles.likeButton, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons
                    name={isLiked ? "heart" : "heart-outline"}
                    size={24}
                    color={isLiked ? colors.accent : colors.muted}
                  />
                </Pressable>
              </View>
            </View>

            {/* Scrubber */}
            <View style={styles.seekWrap}>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={total}
                value={Math.min(seeking ?? position, total)}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.surfaceHighest}
                thumbTintColor={colors.accent}
                onSlidingStart={(v) => setSeeking(v)}
                onSlidingComplete={async (v) => {
                  setSeeking(null);
                  await TrackPlayer.seekTo(v);
                }}
              />
              <View style={styles.times}>
                <Text style={[styles.time, { color: colors.faint }]}>{formatDuration(seeking ?? position)}</Text>
                <Text style={[styles.time, { color: colors.faint }]}>
                  -{formatDuration(Math.max(0, total - (seeking ?? position)))}
                </Text>
              </View>
            </View>

            {/* Transport */}
            <View style={styles.controlsRow}>
              <Pressable hitSlop={12} onPress={toggleShuffle} style={({ pressed }) => [styles.sideControl, pressed && { opacity: 0.6 }]}>
                <Ionicons
                  name="shuffle"
                  size={22}
                  color={shuffle ? colors.accent : colors.muted}
                />
                {shuffle && <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />}
              </Pressable>
              <Pressable hitSlop={12} onPress={() => playPrevious()} style={({ pressed }) => [styles.skipControl, pressed && { opacity: 0.6 }]}>
                <Ionicons name="play-back" size={32} color={colors.text} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.playButton,
                  { backgroundColor: colors.accent },
                  pressed && { transform: [{ scale: 0.97 }], backgroundColor: colors.copper },
                ]}
                onPress={async () => {
                  setSpinning(true);
                  await togglePlayPause();
                  setSpinning(false);
                }}
              >
                {spinning && !playing ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Ionicons
                    name={playing ? "pause" : "play"}
                    size={30}
                    color={colors.onAccent}
                    style={playing ? undefined : { marginLeft: 3 }}
                  />
                )}
              </Pressable>
              <Pressable hitSlop={12} onPress={() => playNext(false)} style={({ pressed }) => [styles.skipControl, pressed && { opacity: 0.6 }]}>
                <Ionicons name="play-forward" size={32} color={colors.text} />
              </Pressable>
              <Pressable hitSlop={12} onPress={cycleRepeat} style={({ pressed }) => [styles.sideControl, pressed && { opacity: 0.6 }]}>
                <Ionicons name="repeat" size={22} color={repeat !== "off" ? colors.accent : colors.muted} />
                {repeat === "track" && <Text style={[styles.repeatOne, { color: colors.accent }]}>1</Text>}
              </Pressable>
            </View>

            {/* Volume */}
            <View style={styles.volumeRow}>
              <Ionicons name="volume-low-outline" size={16} color={colors.faint} />
              <Slider
                style={styles.volume}
                minimumValue={0}
                maximumValue={1}
                value={volume}
                minimumTrackTintColor={colors.muted}
                maximumTrackTintColor={colors.surfaceHighest}
                thumbTintColor={colors.muted}
                onValueChange={(v) => {
                  setVolumeState(v);
                  TrackPlayer.setVolume(v).catch(() => {});
                }}
              />
              <Ionicons name="volume-high-outline" size={16} color={colors.faint} />
            </View>

            {/* Up next */}
            {upNext && (
              <View style={[styles.upNextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.upNextLabel, { color: colors.faint }]}>UP NEXT</Text>
                <Text numberOfLines={1} style={[styles.upNextTitle, { color: colors.text }]}>
                  {upNext.title}
                </Text>
                <Text numberOfLines={1} style={[styles.upNextArtist, { color: colors.muted }]}>
                  {upNext.artist || "Unknown artist"}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function CloseButton() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable hitSlop={12} onPress={() => router.back()} style={{ padding: 12 }}>
      <Ionicons name="chevron-down" size={26} color={colors.text} />
    </Pressable>
  );
}

function sourceLabel(source: string): string | null {
  return source.includes(":") ? source.split(":")[0].toUpperCase() : null;
}

function sourceDisplay(source: string): string {
  return source.includes(":") ? source.split(":").slice(1).join(":").trim() : source;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: {
    fontFamily: SANS.regular,
    fontSize: 15,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    minHeight: 52,
    gap: 8,
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceWrap: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  sourceEyebrow: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sourceName: {
    fontFamily: SERIF.regular,
    fontSize: 17,
  },
  lyricsWrap: {
    flex: 1,
    marginTop: 8,
  },
  artWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  artFrame: {
    flex: 1,
    width: "100%",
    maxWidth: 460,
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    backgroundColor: "#1C1A18",
  },
  art: {
    width: "100%",
    height: "100%",
  },
  statusChip: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusChipText: {
    fontFamily: SANS.semiBold,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  titleSide: {
    width: 44,
    alignItems: "flex-end",
  },
  titleCenter: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
  },
  likeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: SERIF.regular,
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
  },
  artist: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
  },
  seekWrap: {
    paddingHorizontal: 24,
    marginTop: 2,
  },
  slider: {
    width: "100%",
    height: 30,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    fontFamily: SANS.semiBold,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
    paddingTop: 8,
  },
  sideControl: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    position: "absolute",
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  repeatOne: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 8,
    fontWeight: "700",
  },
  skipControl: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 30,
    paddingTop: 12,
  },
  volume: {
    flex: 1,
    height: 24,
  },
  upNextCard: {
    marginHorizontal: 24,
    marginTop: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 1,
  },
  upNextLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  upNextTitle: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  upNextArtist: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
});
