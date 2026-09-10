import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import Artwork from "@/components/Artwork";
import { useTheme } from "@/components/Theme";
import { SANS, SERIF } from "@/lib/theme";
import { jumpTo, clearUpcoming, moveInQueue, removeFromQueue } from "@/lib/player";
import { formatDuration } from "@/lib/types";
import { useQueueStore } from "@/store/queue";

export default function QueueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { songs, index, sourceName } = useQueueStore();
  const current = songs[index] ?? null;
  const upcoming = songs.slice(index + 1);
  // Queue index currently being repositioned via its slider (null = none).
  const [moving, setMoving] = useState<number | null>(null);
  const [sliderPos, setSliderPos] = useState(0);
  const upcomingSeconds = React.useMemo(
    () => upcoming.reduce((sum, s) => sum + (s.duration > 0 ? s.duration : 0), 0),
    [upcoming]
  );

  // The list shifts under us when playback advances — drop any active
  // slider so it never points at the wrong track.
  React.useEffect(() => {
    setMoving(null);
  }, [index]);

  const handleClose = () => router.back();

  const jump = (i: number) => {
    jumpTo(i).catch((e) => {
      Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
    });
    router.back();
  };

  const grab = (queueIndex: number) => {
    setMoving(queueIndex);
    setSliderPos(queueIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const commitMove = (from: number, to: number) => {
    const dest = Math.round(to);
    if (dest === from) return;
    moveInQueue(from, dest).catch(() => {});
    // The item now lives at `dest` — keep the slider attached to it.
    setMoving(dest);
    setSliderPos(dest);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const removeAt = (queueIndex: number) => {
    // Indices shift after a removal, so drop any active slider first.
    setMoving(null);
    removeFromQueue(queueIndex).catch(() => {});
  };

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
          <Pressable
            hitSlop={10}
            onPress={() => {
              setMoving(null);
              clearUpcoming().catch(() => {});
            }}
          >
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
          const isMoving = moving === queueIndex && queueIndex < songs.length;
          const canReorder = songs.length - 1 > index + 1;
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
                  <Pressable style={styles.rowMain} onPress={() => jump(queueIndex)}>
                    <Text style={[styles.position, { color: colors.faint }]}>{queueIndex - index}</Text>
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
                        onPress={() => (isMoving ? setMoving(null) : grab(queueIndex))}
                        style={[
                          styles.actionBtn,
                          isMoving && { backgroundColor: colors.elevated, borderRadius: 8 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={isMoving ? "Done reordering" : `Reorder ${item.title}`}
                      >
                        <Ionicons name="menu" size={19} color={isMoving ? colors.accent : colors.muted} />
                      </Pressable>
                    )}
                    <Pressable
                      hitSlop={8}
                      onPress={() => removeAt(queueIndex)}
                      style={styles.actionBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.title} from queue`}
                    >
                      <Ionicons name="close" size={18} color={colors.faint} />
                    </Pressable>
                  </View>
                </View>
                {isMoving && (
                  <View style={styles.sliderWrap}>
                    <Text style={[styles.sliderLabel, { color: colors.accent }]}>
                      {Math.round(sliderPos) - index} of {songs.length - index - 1}
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={index + 1}
                      maximumValue={Math.max(index + 1, songs.length - 1)}
                      step={1}
                      value={Math.min(Math.max(sliderPos, index + 1), Math.max(index + 1, songs.length - 1))}
                      minimumTrackTintColor={colors.accent}
                      maximumTrackTintColor={colors.surfaceHighest}
                      thumbTintColor={colors.accent}
                      onValueChange={setSliderPos}
                      onSlidingComplete={(v) => commitMove(queueIndex, v)}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

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
