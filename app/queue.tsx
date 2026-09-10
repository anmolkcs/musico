import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import Artwork from "@/components/Artwork";
import { useTheme } from "@/components/Theme";
import { SANS, SERIF, type ThemeColors } from "@/lib/theme";
import { jumpTo, clearUpcoming, moveInQueue, removeFromQueue } from "@/lib/player";
import { formatDuration, Song } from "@/lib/types";
import { useQueueStore } from "@/store/queue";

export default function QueueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { songs, index, sourceName } = useQueueStore();
  const current = songs[index] ?? null;
  const upcoming = songs.slice(index + 1);
  // Queue index currently being repositioned via its slider (null = none),
  // plus the id grabbed there — the slider belongs to the song, not the slot.
  const [moving, setMoving] = useState<number | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const upcomingSeconds = React.useMemo(
    () => upcoming.reduce((sum, s) => sum + (s.duration > 0 ? s.duration : 0), 0),
    [upcoming]
  );

  // The list shifts under us when playback advances or the queue is
  // replaced (new playQueue, import, clear) — drop a slider that no longer
  // points at its grabbed song instead of moving the wrong track.
  React.useEffect(() => {
    if (moving != null && (moving >= songs.length || songs[moving]?.id !== movingId)) {
      setMoving(null);
      setMovingId(null);
    }
  }, [songs, index, moving, movingId]);

  const handleClose = useCallback(() => router.back(), [router]);

  const jump = useCallback(
    (i: number) => {
      jumpTo(i).catch((e) => {
        Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
      });
      router.back();
    },
    [router]
  );

  const grab = useCallback(
    (queueIndex: number) => {
      setMoving(queueIndex);
      setMovingId(songs[queueIndex]?.id ?? null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [songs]
  );

  const collapse = useCallback(() => {
    setMoving(null);
    setMovingId(null);
    setScrollEnabled(true);
  }, []);

  const commitMove = useCallback(async (from: number, to: number) => {
    const dest = Math.round(to);
    try {
      if (dest === from) return;
      await moveInQueue(from, dest);
      // The item now lives at `dest` — keep the slider attached to it.
      setMoving(dest);
      setMovingId(useQueueStore.getState().songs[dest]?.id ?? null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      Alert.alert("Couldn't reorder", "The player didn't accept the move. Try again.");
    } finally {
      setScrollEnabled(true);
    }
  }, []);

  const removeAt = useCallback((queueIndex: number) => {
    // Indices shift after a removal, so drop any active slider first.
    setMoving(null);
    setMovingId(null);
    removeFromQueue(queueIndex).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setMoving(null);
    setMovingId(null);
    clearUpcoming().catch(() => {});
  }, []);

  const lockScroll = useCallback(() => setScrollEnabled(false), []);
  const unlockScroll = useCallback(() => setScrollEnabled(true), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Pressable
          hitSlop={12}
          onPress={handleClose}
          style={({ pressed }) => [styles.topButton, pressed && { backgroundColor: colors.elevated }]}
        >
          <Ionicons name="chevron-down" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>PLAY QUEUE</Text>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {sourceName && sourceName !== "queue" ? sourceName : "Now playing"}
          </Text>
        </View>
        {upcoming.length > 0 && (
          <Pressable hitSlop={10} onPress={clearAll}>
            <Text style={[styles.clear, { color: colors.accent }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      {current && (
        <View style={[styles.nowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Artwork song={current} size={48} radius={4} />
          <View style={styles.meta}>
            <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.accent }]}>
              {current.title}
            </Text>
            <Text numberOfLines={1} style={[styles.rowArtist, { color: colors.muted }]}>
              {current.artist || "Unknown artist"}
            </Text>
          </View>
          <Ionicons name="volume-high" size={18} color={colors.accent} />
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>
        NEXT UP
        {upcoming.length > 0
          ? ` · ${upcoming.length}${upcomingSeconds > 0 ? ` · ${formatDuration(upcomingSeconds)}` : ""}`
          : ""}
      </Text>
      {upcoming.length > 1 && (
        <Text style={[styles.sectionHint, { color: colors.faint }]}>
          Tap the handle, then drag the slider to reposition.
        </Text>
      )}

      <FlatList
        data={upcoming}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        extraData={moving}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="list-outline" size={34} color={colors.faint} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Nothing queued. Long-press a song and choose “Play next” or “Add to queue”.
            </Text>
          </View>
        }
        renderItem={({ item, index: i }) => {
          const queueIndex = index + 1 + i;
          return (
            <QueueRow
              item={item}
              queueIndex={queueIndex}
              activeIndex={index}
              lastIndex={songs.length - 1}
              totalUpcoming={songs.length - index - 1}
              canReorder={songs.length - 1 > index + 1}
              isMoving={moving === queueIndex && queueIndex < songs.length}
              colors={colors}
              onJump={jump}
              onGrab={grab}
              onCollapse={collapse}
              onCommit={commitMove}
              onRemove={removeAt}
              onSlideStart={lockScroll}
              onSlideEnd={unlockScroll}
            />
          );
        }}
      />
    </View>
  );
}

/**
 * One upcoming queue row. Memoized so dragging its slider only re-renders
 * this row — the slider value lives here, not in the screen, which is what
 * kept the thumb frozen while the whole list re-rendered under the gesture.
 */
const QueueRow = React.memo(function QueueRow({
  item,
  queueIndex,
  activeIndex,
  lastIndex,
  totalUpcoming,
  canReorder,
  isMoving,
  colors,
  onJump,
  onGrab,
  onCollapse,
  onCommit,
  onRemove,
  onSlideStart,
  onSlideEnd,
}: {
  item: Song;
  queueIndex: number;
  activeIndex: number;
  lastIndex: number;
  totalUpcoming: number;
  canReorder: boolean;
  isMoving: boolean;
  colors: ThemeColors;
  onJump: (queueIndex: number) => void;
  onGrab: (queueIndex: number) => void;
  onCollapse: () => void;
  onCommit: (from: number, to: number) => void;
  onRemove: (queueIndex: number) => void;
  onSlideStart: () => void;
  onSlideEnd: () => void;
}) {
  const min = activeIndex + 1;
  const max = Math.max(min, lastIndex);
  const [value, setValue] = useState(queueIndex);

  // Re-attach to the row's position whenever its slider opens.
  React.useEffect(() => {
    if (isMoving) setValue(queueIndex);
  }, [isMoving, queueIndex]);

  return (
    <View
      style={[
        styles.upcomingRow,
        { borderBottomColor: colors.border },
        isMoving && { backgroundColor: colors.card },
      ]}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Pressable style={styles.rowMain} onPress={() => onJump(queueIndex)}>
            <Text style={[styles.position, { color: colors.faint }]}>{queueIndex - activeIndex}</Text>
            <Artwork song={item} size={44} radius={4} />
            <View style={styles.meta}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={[styles.rowArtist, { color: colors.muted }]}>
                {item.artist || "Unknown artist"}
                {item.duration > 0 ? ` · ${formatDuration(item.duration)}` : ""}
              </Text>
            </View>
          </Pressable>
          <View style={styles.rowActions}>
            {canReorder && (
              <Pressable
                hitSlop={8}
                onPress={() => (isMoving ? onCollapse() : onGrab(queueIndex))}
                style={[
                  styles.actionBtn,
                  isMoving && { backgroundColor: colors.elevated, borderRadius: 8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={isMoving ? "Done reordering" : `Reorder ${item.title}`}
                accessibilityHint="Shows a slider below to move this song in the queue"
              >
                <Ionicons name="menu" size={19} color={isMoving ? colors.accent : colors.muted} />
              </Pressable>
            )}
            <Pressable
              hitSlop={8}
              onPress={() => onRemove(queueIndex)}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.title} from queue`}
            >
              <Ionicons name="close" size={18} color={colors.faint} />
            </Pressable>
          </View>
        </View>
        {isMoving && (
          <View style={styles.sliderWrap} onTouchEnd={onSlideEnd} onTouchCancel={onSlideEnd}>
            <Text style={[styles.sliderLabel, { color: colors.accent }]}>
              {Math.round(value) - activeIndex} of {totalUpcoming}
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={min}
              maximumValue={max}
              step={1}
              value={Math.min(Math.max(value, min), max)}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.surfaceHighest}
              thumbTintColor={colors.accent}
              onValueChange={setValue}
              onSlidingStart={onSlideStart}
              onSlidingComplete={(v) => {
                // Always unlock first: a cancelled gesture may never call
                // this, in which case the wrapper's onTouchEnd still fires.
                onSlideEnd();
                onCommit(queueIndex, v);
              }}
              accessibilityLabel={`Move ${item.title} in queue`}
              accessibilityValue={{ min, max, now: Math.round(value) }}
            />
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    minHeight: 56,
    gap: 10,
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    flex: 1,
    gap: 1,
  },
  eyebrow: {
    fontFamily: SANS.semiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: SERIF.regular,
    fontSize: 19,
  },
  clear: {
    fontFamily: SANS.semiBold,
    fontSize: 14,
  },
  nowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
  },
  sectionHint: {
    fontFamily: SANS.regular,
    fontSize: 12,
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  upcomingRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  position: {
    fontFamily: SANS.semiBold,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    width: 22,
    textAlign: "right",
  },
  sliderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 20,
    paddingRight: 14,
    paddingBottom: 10,
  },
  sliderLabel: {
    fontFamily: SANS.semiBold,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 44,
    textAlign: "center",
  },
  slider: {
    flex: 1,
    height: 32,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 20,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },
  actionBtn: {
    width: 32,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: SANS.semiBold,
    fontSize: 15,
  },
  rowArtist: {
    fontFamily: SANS.regular,
    fontSize: 13,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyText: {
    fontFamily: SANS.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
});
