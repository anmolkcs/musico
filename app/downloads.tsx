import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Artwork from "@/components/Artwork";
import ScreenHeader from "@/components/ScreenHeader";
import { useTheme } from "@/components/Theme";
import { getDownloadedTracks, openDb } from "@/lib/db";
import { playQueue } from "@/lib/player";
import { Song, TrackRecord } from "@/lib/types";
import { useDownloadsStore } from "@/lib/downloads";

export default function DownloadsScreen() {
  const { colors } = useTheme();
  const items = useDownloadsStore((s) => s.items);
  const { start, cancel, remove } = useDownloadsStore.getState();
  const [downloaded, setDownloaded] = useState<TrackRecord[]>([]);

  const reload = () => {
    openDb()
      .then((db) => getDownloadedTracks(db))
      .then(setDownloaded)
      .catch(() => {});
  };

  useEffect(reload, [items]);

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
    playQueue(done, index, "Downloads").catch(() => {});
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
                onCancel={() => cancel(row.data.song.id)}
                onRetry={() => start(row.data.song)}
              />
            ) : (
              <DoneRow song={row.data} onPlay={() => play(row.index)} onDelete={() => remove(row.data.id).then(reload)} />
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
    <View style={[styles.row, { paddingHorizontal: 16 }]}>
      <Artwork song={song} size={48} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {song.title}
        </Text>
        {status === "downloading" ? (
          <View style={styles.progressTrack}>
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
    <View style={styles.row}>
      <Pressable style={[styles.row, { flex: 1, paddingHorizontal: 0 }]} onPress={onPlay}>
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
    fontSize: 14,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 64,
  },
  title: {
    fontSize: 15,
    fontWeight: "500",
  },
  artist: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 12,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3A3A44",
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
});
