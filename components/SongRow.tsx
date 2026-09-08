import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import Artwork from "./Artwork";
import { formatDuration, Song } from "../lib/types";
import { playQueue } from "../lib/player";
import { useTrackMenu } from "../store/menu";
import { useTheme } from "./Theme";

type Props = {
  song: Song;
  index?: number;
  queue?: Song[];
  sourceName?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  showArtist?: boolean;
  trailing?: React.ReactNode;
  dense?: boolean;
};

export default function SongRow({
  song,
  index,
  queue,
  sourceName,
  onPress,
  onLongPress,
  showArtist = true,
  trailing,
  dense = false,
}: Props) {
  const { colors } = useTheme();
  const openMenu = useTrackMenu((s) => s.open);
  const size = dense ? 40 : 48;

  const handlePress = () => {
    Keyboard.dismiss();
    if (onPress) {
      onPress();
      return;
    }
    playQueue(queue && queue.length > 0 ? queue : [song], index ?? 0, sourceName ?? "queue").catch((e) => {
      Alert.alert("Playback error", e instanceof Error ? e.message : "Could not play this song");
    });
  };

  const handleLongPress = onLongPress ?? (() => openMenu(song));

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: dense ? 12 : 16, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.elevated },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${song.title}${song.artist ? ` by ${song.artist}` : ""}`}
    >
      <Artwork song={song} size={size} radius={dense ? 6 : 8} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {song.title}
        </Text>
        {showArtist && (
          <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
            {song.artist || "Unknown artist"}
          </Text>
        )}
      </View>
      {song.duration > 0 && !trailing && (
        <Text style={[styles.duration, { color: colors.muted }]}>{formatDuration(song.duration)}</Text>
      )}
      {trailing}
      {!trailing && (
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation();
            openMenu(song);
          }}
          style={styles.more}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.muted} />
        </Pressable>
      )}
    </Pressable>
  );
}

export function SongRowSkeleton({ dense = false }: { dense?: boolean }) {
  const { colors } = useTheme();
  const size = dense ? 40 : 48;
  return (
    <View
      accessibilityLabel="Loading song"
      style={[
        styles.row,
        { paddingHorizontal: dense ? 12 : 16, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.skeletonArt, { width: size, height: size, backgroundColor: colors.elevated }]} />
      <View style={styles.meta}>
        <View style={[styles.skeletonTitle, { backgroundColor: colors.elevated }]} />
        <View style={[styles.skeletonArtist, { backgroundColor: colors.elevated }]} />
      </View>
      <View style={[styles.skeletonMore, { backgroundColor: colors.elevated }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  index: {
    fontSize: 14,
    fontWeight: "600",
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
  },
  artist: {
    fontSize: 13,
  },
  duration: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  more: {
    width: 28,
    alignItems: "center",
  },
  skeletonArt: {
    borderRadius: 8,
  },
  skeletonTitle: {
    width: "72%",
    height: 14,
    borderRadius: 5,
  },
  skeletonArtist: {
    width: "48%",
    height: 12,
    borderRadius: 5,
    marginTop: 7,
  },
  skeletonMore: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});
