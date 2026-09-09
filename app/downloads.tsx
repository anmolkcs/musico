import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Artwork from "@/components/Artwork";
import ScreenHeader from "@/components/ScreenHeader";
import { useTheme } from "@/components/Theme";
import { useLibraryStore } from "@/store/library";
import { playQueue } from "@/lib/player";
import { Song } from "@/lib/types";
import { useDownloadsStore } from "@/lib/downloads";
import { SERIF, SANS } from "@/lib/theme";

export default function DownloadsScreen() {
  const { colors } = useTheme();
  const items = useDownloadsStore((s) => s.items);
  const { start, cancel, remove } = useDownloadsStore.getState();
  const downloaded = useLibraryStore((s) => s.downloads);
  useEffect(() => {
    useLibraryStore.getState().refresh().catch(() => {});
  }, []);

  const active = Object.values(items).filter((i) => i.status === "downloading" || i.status === "error");
  const done = downloaded.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    thumbnail: t.thumbnail,
    type: "song" as const,
  }));

  const play = (index: number) => {
    playQueue(done, index, "Downloads").catch((error) => {
      Alert.alert("Playback error", error instanceof Error ? error.message : "Could not play this download");
    });
  };

  const rows = [...active.map((a) => ({ kind: "active" as const, data: a })), ...done.map((d, i) => ({ kind: "done" as const, data: d, index: i }))];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Downloads" subtitle={`${done.length} available offline`} />
      {rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="download-outline" size={36} color={colors.muted} />
          <Text style={[styles.empty, { color: colors.muted }]}>
            Tap ⋯ on any song and choose Download
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows as any[]}
          keyExtractor={(row, i) => `${row.kind}-${row.data.id}-${i}`}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item: row }: any) =>
            row.kind === "active" ? (
              <ActiveRow
                song={row.data.song}
                status={row.data.status}
                progress={row.data.progress}
                error={row.data.error}
                onCancel={() => cancel(row.data.song.id).catch(() => Alert.alert("Download error", "Could not cancel the download"))}
                onRetry={() => start(row.data.song).catch((error) => Alert.alert("Download error", error instanceof Error ? error.message : "Could not retry the download"))}
              />
            ) : (
              <DoneRow
                song={row.data}
                onPlay={() => play(row.index)}
                onDelete={() =>
                  remove(row.data.id).catch(() => Alert.alert("Download error", "Could not delete the download"))
                }
              />
            )
          }
        />
      )}
    </View>
  );
}

function ActiveRow({
  song,
  status,
  progress,
  error,
  onCancel,
  onRetry,
}: {
  song: Song;
  status: string;
  progress: number;
  error?: string;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: 20, borderBottomColor: colors.border }]}>
      <Artwork song={song} size={48} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {song.title}
        </Text>
        {status === "downloading" ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHighest }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
        ) : (
          <Text numberOfLines={1} style={[styles.errorText, { color: colors.accent }]}>
            {error ?? "Failed"}
          </Text>
        )}
      </View>
      <Pressable hitSlop={10} onPress={status === "error" ? onRetry : onCancel}>
        <Ionicons name={status === "error" ? "refresh" : "close"} size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function DoneRow({ song, onPlay, onDelete }: { song: Song; onPlay: () => void; onDelete: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Pressable style={[styles.row, { flex: 1, paddingHorizontal: 0, borderBottomWidth: 0 }]} onPress={onPlay}>
        <Artwork song={song} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {song.title}
          </Text>
          <Text numberOfLines={1} style={[styles.artist, { color: colors.muted }]}>
            {song.artist}
          </Text>
        </View>
        <Ionicons name="arrow-down-circle" size={18} color={colors.accent} />
      </Pressable>
      <Pressable hitSlop={10} onPress={onDelete} style={{ padding: 6 }}>
        <Ionicons name="trash-outline" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  empty: {
    fontFamily: SERIF.italic,
    fontSize: 15,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(247,244,238,0.08)",
  },
  title: {
    fontFamily: SANS.semiBold,
    fontSize: 15,
  },
  artist: {
    fontFamily: SANS.regular,
    fontSize: 13,
  },
  errorText: {
    fontFamily: SANS.regular,
    fontSize: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
});
