import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  // Reorder target opened in the move sheet (null = closed). The song id
  // travels along so a shifted list can never move the wrong track.
  const [moveTarget, setMoveTarget] = useState<{ queueIndex: number; id: string } | null>(null);
  const upcomingSeconds = React.useMemo(
    () => upcoming.reduce((sum, s) => sum + (s.duration > 0 ? s.duration : 0), 0),
    [upcoming]
  );

  // The list shifts under us when playback advances or the queue is
  // replaced — close a sheet that no longer points at its grabbed song.
  React.useEffect(() => {
    if (
      moveTarget != null &&
      (moveTarget.queueIndex >= songs.length || songs[moveTarget.queueIndex]?.id !== moveTarget.id)
    ) {
      setMoveTarget(null);
    }
  }, [songs, index, moveTarget]);

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

  const openMove = useCallback(
    (queueIndex: number) => {
      const id = songs[queueIndex]?.id;
      if (!id) return;
      setMoveTarget({ queueIndex, id });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [songs]
  );

  const closeMove = useCallback(() => setMoveTarget(null), []);

  const commitMove = useCallback(async (from: number, to: number) => {
    const dest = Math.round(to);
    if (dest === from) {
      setMoveTarget(null);
      return;
    }
    try {
      await moveInQueue(from, dest);
      setMoveTarget(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      Alert.alert("Couldn't reorder", "The player didn't accept the move. Try again.");
    }
  }, []);

  const removeAt = useCallback((queueIndex: number) => {
    setMoveTarget(null);
    removeFromQueue(queueIndex).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setMoveTarget(null);
    clearUpcoming().catch(() => {});
  }, []);

  const targetSong = moveTarget ? (songs[moveTarget.queueIndex] ?? null) : null;
  const targetValid = moveTarget != null && targetSong?.id === moveTarget.id;

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
        <Text style={[styles.sectionHint, { color: colors.faint }]}>Tap the handle to reposition.</Text>
      )}

      <FlatList
        data={upcoming}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
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
              canReorder={songs.length - 1 > index + 1}
              colors={colors}
              onJump={jump}
              onOpenMove={openMove}
              onRemove={removeAt}
            />
          );
        }}
      />

      {targetValid && moveTarget && targetSong && (
        <QueueMoveSheet
          key={`${moveTarget.id}-${moveTarget.queueIndex}`}
          song={targetSong}
          queueIndex={moveTarget.queueIndex}
          activeIndex={index}
          total={songs.length - index - 1}
          colors={colors}
          onClose={closeMove}
          onCommit={commitMove}
        />
      )}
    </View>
  );
}

const QueueRow = React.memo(function QueueRow({
  item,
  queueIndex,
  activeIndex,
  canReorder,
  colors,
  onJump,
  onOpenMove,
  onRemove,
}: {
  item: Song;
  queueIndex: number;
  activeIndex: number;
  canReorder: boolean;
  colors: ThemeColors;
  onJump: (queueIndex: number) => void;
  onOpenMove: (queueIndex: number) => void;
  onRemove: (queueIndex: number) => void;
}) {
  return (
    <View style={[styles.upcomingRow, { borderBottomColor: colors.border }]}>
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
              onPress={() => onOpenMove(queueIndex)}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={`Move ${item.title} in queue`}
              accessibilityHint="Opens position options for this song"
            >
              <Ionicons name="menu" size={19} color={colors.muted} />
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
    </View>
  );
});

/**
 * Reorder sheet: drag the slider, tap a position on the ruler, or use the
 * jump buttons. Every path funnels into onCommit — the tap controls work
 * even where drag gestures misbehave, so reordering always has a way
 * through. Mounted fresh per target (see key above), so no state resync.
 */
function QueueMoveSheet({
  song,
  queueIndex,
  activeIndex,
  total,
  colors,
  onClose,
  onCommit,
}: {
  song: Song;
  queueIndex: number;
  activeIndex: number;
  total: number;
  colors: ThemeColors;
  onClose: () => void;
  onCommit: (from: number, to: number) => void;
}) {
  const startPos = queueIndex - activeIndex;
  const [value, setValue] = useState(startPos);
  const rulerRef = React.useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Center the current position in the ruler on open.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      rulerRef.current?.scrollTo({ x: Math.max(0, (startPos - 1) * RULER_CELL - 120), animated: false });
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (position: number) => {
    const clamped = Math.min(Math.max(Math.round(position), 1), total);
    onCommit(queueIndex, activeIndex + clamped);
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.elevated, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.sheetHeader}>
          <Text numberOfLines={1} style={[styles.sheetTitle, { color: colors.text }]}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={[styles.sheetSubtitle, { color: colors.muted }]}>
            {song.artist || "Unknown artist"}
          </Text>
        </View>
        <Text style={[styles.moveLabel, { color: colors.text }]}>
          {Math.round(value)} <Text style={{ color: colors.faint }}>of {total}</Text>
        </Text>
        <Slider
          style={styles.sheetSlider}
          minimumValue={1}
          maximumValue={Math.max(1, total)}
          step={1}
          value={Math.min(Math.max(value, 1), Math.max(1, total))}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.surfaceHighest}
          thumbTintColor={colors.accent}
          onValueChange={setValue}
          onSlidingComplete={(v) => go(v)}
          accessibilityLabel={`Move ${song.title} to position`}
          accessibilityValue={{ min: 1, max: total, now: Math.round(value) }}
        />
        <View style={styles.stepRow}>
          <SheetButton label="Top" onPress={() => go(1)} colors={colors} disabled={Math.round(value) <= 1} />
          <SheetButton label="−1" onPress={() => go(Math.round(value) - 1)} colors={colors} disabled={Math.round(value) <= 1} />
          <SheetButton label="+1" onPress={() => go(Math.round(value) + 1)} colors={colors} disabled={Math.round(value) >= total} />
          <SheetButton label="End" onPress={() => go(total)} colors={colors} disabled={Math.round(value) >= total} />
        </View>
        <ScrollView
          ref={rulerRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rulerContent}
        >
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const selected = Math.round(value) === n;
            return (
              <Pressable
                key={n}
                onPress={() => go(n)}
                style={[
                  styles.rulerCell,
                  {
                    backgroundColor: selected ? colors.accent : colors.card,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Move to position ${n} of ${total}`}
              >
                <Text
                  style={[
                    styles.rulerText,
                    { color: selected ? colors.onAccent : colors.muted },
                    selected && { fontFamily: SANS.semiBold },
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SheetButton({
  label,
  onPress,
  colors,
  disabled,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && !disabled && { backgroundColor: colors.surfaceHighest },
        disabled && { opacity: 0.35 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label === "−1" ? "Move up one" : label === "+1" ? "Move down one" : `Move to ${label.toLowerCase()}`}
    >
      <Text style={[styles.stepText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const RULER_CELL = 52;

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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,9,8,0.62)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  sheetHeader: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 2,
  },
  sheetTitle: {
    fontFamily: SERIF.medium,
    fontSize: 17,
    lineHeight: 23,
  },
  sheetSubtitle: {
    fontFamily: SANS.regular,
    fontSize: 13,
  },
  moveLabel: {
    fontFamily: SERIF.medium,
    fontSize: 22,
    textAlign: "center",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  sheetSlider: {
    marginHorizontal: 16,
    height: 44,
  },
  stepRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  stepBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontFamily: SANS.semiBold,
    fontSize: 13,
  },
  rulerContent: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rulerCell: {
    width: RULER_CELL - 8,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  rulerText: {
    fontFamily: SANS.regular,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
});
