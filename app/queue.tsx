import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

  const handleClose = () => router.back();

  const jump = (i: number) => {
    jumpTo(i).catch((e) => {
      Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
    });
    router.back();
  };

  const move = (from: number, delta: number) => {
    moveInQueue(from, from + delta).catch(() => {});
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
          <Pressable hitSlop={10} onPress={() => clearUpcoming().catch(() => {})}>
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
        NEXT UP{upcoming.length > 0 ? ` · ${upcoming.length}` : ""}
      </Text>

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
            <View style={[styles.upcomingRow, { borderBottomColor: colors.border }]}>
              <Pressable style={styles.rowMain} onPress={() => jump(queueIndex)}>
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
                <Pressable
                  hitSlop={8}
                  disabled={queueIndex <= index + 1}
                  onPress={() => move(queueIndex, -1)}
                  style={[styles.actionBtn, queueIndex <= index + 1 && { opacity: 0.25 }]}
                >
                  <Ionicons name="arrow-up" size={17} color={colors.muted} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  disabled={queueIndex >= songs.length - 1}
                  onPress={() => move(queueIndex, 1)}
                  style={[styles.actionBtn, queueIndex >= songs.length - 1 && { opacity: 0.25 }]}
                >
                  <Ionicons name="arrow-down" size={17} color={colors.muted} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => removeFromQueue(queueIndex)} style={styles.actionBtn}>
                  <Ionicons name="close" size={18} color={colors.faint} />
                </Pressable>
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
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
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
