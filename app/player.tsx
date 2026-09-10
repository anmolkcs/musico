import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import TrackPlayer, { State, usePlaybackState, useProgress } from "react-native-track-player";
import LyricsView from "@/components/LyricsView";
import { useTheme } from "@/components/Theme";
import { SANS, SERIF, VINYL_SHADOW } from "@/lib/theme";
import { cycleRepeat, playNext, playPrevious, togglePlayPause, toggleShuffle } from "@/lib/player";
import { formatDuration } from "@/lib/types";
import type { Song } from "@/lib/types";
import { getLyrics } from "@/lib/lyrics";
import { useSaavnArtwork } from "@/lib/saavn-art";
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
  const [artFailed, setArtFailed] = useState(false);
  const playing = playbackState?.state === State.Playing || playbackState?.state === State.Buffering;
  // High-res Saavn cover for the playing song; the YouTube thumbnail stays
  // as the fallback. Hooks stay above the empty-state early return.
  const saavnArt = useSaavnArtwork(song?.title, song?.artist, song != null);
  React.useEffect(() => {
    setArtFailed(false);
  }, [song?.id, saavnArt]);

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
  const sleeveUri =
    !artFailed && saavnArt ? saavnArt : song.thumbnail || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} {...panResponder.panHandlers}>
      <LinearGradient
        colors={[colors.card, colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
        {showLyrics ? (
          <View style={styles.lyricsTopRow}>
            <Pressable
              hitSlop={12}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.lyricsTopButton, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-down" size={22} color={colors.muted} />
            </Pressable>
            <View style={styles.lyricsHeading}>
              <Text style={[styles.lyricsEyebrow, { color: colors.accent }]}>NOW PLAYING • LYRICS</Text>
              <Text numberOfLines={1} style={[styles.lyricsSongTitle, { color: colors.text }]}>{song.title}</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={() => like(song, !isLiked).catch(() => {})}
              style={[styles.lyricsTopButton, { backgroundColor: colors.card }]}
            >
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={19} color={isLiked ? colors.accent : colors.muted} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.topRow}>
            <Pressable
              hitSlop={12}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.topButton, pressed && { backgroundColor: colors.elevated }]}
            >
              <Ionicons name="arrow-back" size={25} color={colors.text} />
            </Pressable>
            <View style={[styles.vinylMark, { backgroundColor: colors.card }]}>
              <Ionicons name="disc-outline" size={23} color={colors.accent} />
            </View>
            <View style={styles.sourceWrap}>
              <Text style={[styles.nowPlaying, { color: colors.text }]}>Now Playing</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={() => like(song, !isLiked).catch(() => {})}
              style={({ pressed }) => [styles.likeButton, pressed && { opacity: 0.6 }]}
            >
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={24}
                color={isLiked ? colors.accent : colors.muted}
              />
            </Pressable>
          </View>
        )}

        {showLyrics ? (
          <View style={styles.lyricsWrap}>
            <LyricsView song={song} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
          >
            <>
            <View style={styles.playlistContext}>
              <View style={styles.playlistCopy}>
                <Text style={[styles.sourceEyebrow, { color: colors.muted }]}>PLAYING FROM PLAYLIST</Text>
                <Text numberOfLines={1} style={[styles.sourceName, { color: colors.text }]}>
                  {sourceName && sourceName !== "queue" ? sourceDisplay(sourceName) : "Your library"}
                </Text>
              </View>
            </View>

            {/* Sleeve and its tactile playback metadata */}
            <View style={styles.artWrap} pointerEvents="none">
              <View style={[styles.artFrame, VINYL_SHADOW, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: sleeveUri }}
                  style={styles.art}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  onError={() => setArtFailed(true)}
                />
                <View style={[styles.statusChip, { backgroundColor: "rgba(20,19,18,0.86)", borderColor: "rgba(247,244,238,0.10)" }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.statusChipText, { color: OVERLAY_TEXT }]}>STREAMING</Text>
                </View>
                <View style={[styles.artDetails, { backgroundColor: "rgba(20,19,18,0.88)" }]}>
                  <Text numberOfLines={1} style={[styles.artTitle, { color: OVERLAY_TEXT }]}>{song.title}</Text>
                  <Text numberOfLines={1} style={[styles.artArtist, { color: OVERLAY_SUB }]}>{song.artist || "Unknown artist"}</Text>
                </View>
              </View>
            </View>

            {/* Full-width scrubber */}
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

            <UpNextCard />
            <LyricsPreviewCard song={song} onOpen={() => setShowLyrics(true)} />
            </>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function UpNextCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { songs, index } = useQueueStore();
  const next = songs[index + 1] ?? null;
  const remaining = Math.max(0, songs.length - index - 1);
  if (!next) {
    return (
      <View
        style={[styles.destinationCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
      >
        <View style={[styles.destinationIcon, { backgroundColor: colors.elevated }]}>
          <Ionicons name="checkmark" size={22} color={colors.faint} />
        </View>
        <View style={styles.destinationCopy}>
          <Text style={[styles.cardEyebrow, { color: colors.muted }]}>UP NEXT</Text>
          <Text numberOfLines={1} style={[styles.destinationTitle, { color: colors.faint }]}>
            End of queue
          </Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      style={[styles.destinationCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
      onPress={() => router.push("/queue")}
      accessibilityRole="button"
      accessibilityLabel="Open queue"
    >
      <View style={[styles.destinationIcon, { backgroundColor: colors.elevated }]}>
        <Ionicons name="list-outline" size={22} color={colors.accent} />
      </View>
      <View style={styles.destinationCopy}>
        <Text style={[styles.cardEyebrow, { color: colors.muted }]}>
          UP NEXT{remaining > 1 ? ` • ${remaining} TRACKS` : ""}
        </Text>
        <Text numberOfLines={1} style={[styles.destinationTitle, { color: colors.text }]}>
          {next.title} — {next.artist || "Unknown artist"}
        </Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={() => playNext(false)}
        style={({ pressed }) => [styles.upNextPlay, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`Play next: ${next.title}`}
      >
        <Ionicons name="play-forward" size={20} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

function LyricsPreviewCard({ song, onOpen }: { song: Song; onOpen: () => void }) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<string[] | null>(null);
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [hasLyrics, setHasLyrics] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setLineCount(null);
    setHasLyrics(null);
    const current = { ...song };
    getLyrics(current)
      .then((result) => {
        if (!alive) return;
        if (result.synced && result.synced.length > 0) {
          setPreview(result.synced.slice(0, 2).map((l) => l.text).filter(Boolean));
          setLineCount(result.synced.length);
          setHasLyrics(true);
        } else if (result.plain) {
          const lines = result.plain.split("\n").map((l) => l.trim()).filter(Boolean);
          setPreview(lines.slice(0, 2));
          setLineCount(lines.length);
          setHasLyrics(true);
        } else {
          setHasLyrics(false);
        }
      })
      .catch(() => alive && setHasLyrics(false));
    return () => {
      alive = false;
    };
    // Depend on the stable track id: queue store updates may recreate the
    // song object on unrelated renders, which must not refetch lyrics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  if (hasLyrics === false) return null;

  return (
    <Pressable
      style={[styles.lyricsCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open full lyrics"
    >
      <View style={styles.lyricsHeader}>
        <Text style={[styles.lyricsNumber, { color: colors.accent }]}>
          {lineCount != null ? String(lineCount).padStart(2, "0") : "··"}
        </Text>
        <Text style={[styles.cardEyebrow, { color: colors.muted }]}>LYRICS SNEAK-PEEK</Text>
        <View style={styles.headerSpacer} />
        <Text style={[styles.fullLyrics, { color: colors.muted }]}>Full lyrics  ›</Text>
      </View>
      {preview && preview.length > 0 ? (
        <>
          <Text numberOfLines={2} style={[styles.lyricsQuote, { color: colors.text }]}>
            &quot;{preview[0]}
          </Text>
          {preview[1] ? (
            <Text numberOfLines={2} style={[styles.lyricsBody, { color: colors.muted }]}>
              {preview[1]}&quot;
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.lyricsBody, { color: colors.muted }]}>Loading lyrics…</Text>
      )}
    </Pressable>
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

function sourceDisplay(source: string): string {
  return source.includes(":") ? source.split(":").slice(1).join(":").trim() : source;
}

// Text on top of always-dark scrims/gradients (artwork overlay, status chip)
// must be fixed ivory — theme text turns dark in light mode and vanishes.
const OVERLAY_TEXT = "#F7F4EE";
const OVERLAY_SUB = "#CFC8BF";

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
  nowPlaying: {
    fontFamily: SERIF.regular,
    fontSize: 22,
  },
  lyricsTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, minHeight: 52 },
  lyricsTopButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  lyricsHeading: { flex: 1, alignItems: "center", gap: 3 },
  lyricsEyebrow: { fontFamily: SANS.semiBold, fontSize: 10, letterSpacing: 1.05 },
  lyricsSongTitle: { fontFamily: SANS.semiBold, fontSize: 14 },
  vinylMark: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistContext: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 34,
    paddingTop: 17,
    paddingBottom: 12,
    gap: 12,
  },
  playlistCopy: { flex: 1, alignItems: "center" },
  lyricsWrap: {
    flex: 1,
    marginTop: 8,
  },
  artWrap: {
    alignItems: "center",
    paddingHorizontal: 34,
    paddingBottom: 18,
  },
  artFrame: {
    width: "100%",
    maxWidth: 560,
    aspectRatio: 0.98,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    backgroundColor: "#1C1A18",
  },
  artDetails: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 18,
  },
  artTitle: { fontFamily: SANS.semiBold, fontSize: 20, textAlign: "center" },
  artArtist: { fontFamily: SANS.regular, fontSize: 15, textAlign: "center", marginTop: 3 },
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
   likeButton: {
     width: 36,
     height: 36,
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
  destinationCard: {
    marginHorizontal: 24,
    marginTop: 28,
    minHeight: 76,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  destinationIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  destinationCopy: { flex: 1, gap: 4 },
  upNextPlay: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEyebrow: {
    fontFamily: SANS.semiBold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  destinationTitle: {
    fontFamily: SANS.regular,
    fontSize: 17,
  },
  lyricsCard: {
    marginHorizontal: 24,
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  lyricsHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  // Explicit spacer instead of marginLeft:"auto" — auto margins in a row
  // with gap misrender on some Android builds when clipped at the edge.
  headerSpacer: { flex: 1 },
  lyricsNumber: { fontFamily: SANS.bold, fontSize: 14 },
  fullLyrics: { fontFamily: SANS.semiBold, fontSize: 13 },
  lyricsQuote: { fontFamily: SERIF.italic, fontSize: 22, lineHeight: 30, marginTop: 24 },
  lyricsBody: { fontFamily: SANS.regular, fontSize: 17, lineHeight: 28, marginTop: 9 },
});
