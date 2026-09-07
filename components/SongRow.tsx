import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  showArtist = true,
  trailing,
  dense = false,
}: Props) {
  const { colors } = useTheme();
  const openMenu = useTrackMenu((s) => s.open);
  const size = dense ? 40 : 48;

  const handlePress = onPress
    ? onPress
    : () => {
        playQueue(queue && queue.length > 0 ? queue : [song], index ?? 0, sourceName ?? "queue").catch(() => {});
      };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={() => openMenu(song)}
      android_ripple={{ color: colors.border }}
      style={[styles.row, { paddingHorizontal: dense ? 12 : 16 }]}
    >
      {typeof index === "number" ? (
        <Text style={[styles.index, { color: colors.muted, width: size, textAlign: "center" }]}>{index + 1}</Text>
      ) : (
        <Artwork song={song} size={size} radius={dense ? 6 : 8} />
      )}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    gap: 12,
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
    fontWeight: "500",
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
});
